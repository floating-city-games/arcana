let express = require("express");
let wordnet = require("wordnet");
let wiki = require("wikipedia");
let ddgImg = require("duckduckgo-images-api");
const Promise = require("bluebird");
const fs = require("fs/promises");
let app = express();
let lemma = require("wink-lemmatizer");
let posTagger = require("wink-pos-tagger");
const bodyParser = require("body-parser");
let randomWord = require("random-word");
let word2VecUtils = require("./w2vutils.js");
let mm = require("./server.js");

const STOP_WORDS = require("./data/stopWords.js");

const STAT_KEYS = require("./data/stat.json")["stat"];
const STAT_POOL_TOTAL = Object.keys(STAT_KEYS).length * 100;

// init wordnet
wordnet.init();

app.use(function (req, res, next) {
  //Enabling CORS
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, x-client-key, x-client-token, x-client-secret, Authorization"
  );
  next();
});

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(
  bodyParser.urlencoded({
    // to support URL-encoded bodies
    extended: true,
  })
);

async function wikiPage(queryString) {
  try {
    const page = await wiki.page(queryString);
    //Response of type @Page object
    const summary = await page.summary();
    let wikiContent = summary.extract;
    if (summary.type == "disambiguation") {
      wikiContent = wikiContent + " " + (await page.content());
    }
    // console.log(summary);
    let w = {
      extract: wikiContent,
      title: summary.title,
    };
    if (summary.thumbnail) {
      w["thumbnailUrl"] = summary.thumbnail.source;
    }
    // console.log(w)
    return w;
  } catch (error) {
    console.log(error.message);
    return null;
    //=> Typeof wikiError
  }
}

async function wordnetLookup(queryString) {
  return await wordnet.lookup(queryString).catch((err) => {
    console.log("Wordnet Error: No definition for: " + queryString);
    return null;
  });
}

app.get("/stat/:input", function (req, res) {
  let topic = req.params.input.trim();
  let w = {
    name: topic,
    wn: {},
    stat: {},
    wiki: {},
  };
  const r = Promise.try(() => {
    return wikiPage(topic);
  })
    .then((r) => {
      w.wiki = r;
      if (!r) {
        // return Promise.resolve(
        // return res.status(200).json({data:
        throw new Error("no wiki for topic: " + w.name);
        // }))
      }
      return w;
    })
    .then(async (w) => {
      w.wn = await wordnetLookup(topic);
      return w;
    })
    .then((w) => {
      w.stat = doStatMath(w);
      w.move = getMoves(w);
      w.hp = calculateHp(w);
      return w;
    })
    .then(() => {
      return res.status(200).json({ data: w });
    })
    .catch((e) => {
      console.log(e.message);
      return res.status(200).json({
        data: "Couldn't find results for that, try something I can find online please :)",
      });
    });
  // return res.status(200).json({ data: w });
});

function calculateHp(w) {
  let hp = 1;
  let topStats = Object.keys(w.stat).map((item, k) => w.stat[item]);
  topStats.sort((a, b) => b - a);
  let halfStat = Math.floor(topStats.length / 2);
  let i = 0;
  while (i <= halfStat) {
    hp += topStats[i];
    i++;
  }
  hp = hp * halfStat;
  return hp;
}

function getMoves(w) {
  // get moves and create objects to hold them
  // moves only have a source and direction,
  // attacks are generated on stats against opponent stats
  // attacks can damage health, debuff, or buff
  // content should be generated from wiki extract or wordnet

  let cleanText = anyAscii(w.wiki.extract);
  let keywords = stringToKeywords(cleanText);
  var tagger = posTagger();
  let tagged = tagger.tagSentence(keywords.join(" "));

  let candidate = [];
  // repeated words
  keywords.map((item, k) => {
    if (
      keywords.indexOf(item) !== k &&
      candidate.indexOf(item.toLowerCase() + "/REP") < 0
    ) {
      candidate.push(item.toLowerCase() + "/REP");
    }
  });

  // All nouns
  for (let t in tagged) {
    if (tagged[t].pos.slice(0, 2) == "NN") {
      candidate.push(tagged[t].value.toLowerCase() + "/" + tagged[t].pos);
    }
  }

  // pull out numbers
  candidate = candidate.filter((x) => {
    if (isNaN(parseInt(x))) {
      return x;
    }
  });

  // 3 is a good min move list
  // if(candidate.length < 3){
  // check the wordnet
  if (w.wn && w.wn.length > 0) {
    let glossarySum = "";
    for (let e in w.wn) {
      glossarySum += w.wn[e].glossary + ". ";
    }
    let smartGlossary = stringToKeywords(glossarySum);
    let glossaryTag = tagger.tagSentence(smartGlossary.join(" "));
    for (let t in glossaryTag) {
      if (
        glossaryTag[t].pos.slice(0, 2) == "VB" &&
        candidate.indexOf(
          lemma.verb(glossaryTag[t].value.toLowerCase()) + "/VB"
        ) < 0
      ) {
        candidate.push(lemma.verb(glossaryTag[t].value.toLowerCase()) + "/VB");
      }
    }
  }

  // remove topic and topic plural from candidates
  candidate = candidate.filter((item) => {
    return (
      item.slice(0, item.indexOf("/")).toLowerCase() != w.name.toLowerCase()
    );
  });
  candidate = candidate.filter((item) => {
    return (
      item.slice(0, item.indexOf("/")).toLowerCase() !=
      w.name.toLowerCase() + "s"
    );
  });
  candidate = candidate.filter((item) => {
    return (
      item.slice(0, item.indexOf("/")).toLowerCase() !=
      w.name.toLowerCase() + "es"
    );
  });

  // remove dup candidates regardless of type,
  for (let c in candidate) {
    let std = candidate[c].slice(0, candidate[c].indexOf("/")).toLowerCase();
    for (let del in candidate) {
      if (c != del) {
        let comp = candidate[del]
          .slice(0, candidate[del].indexOf("/"))
          .toLowerCase();
        if (std == comp) {
          candidate.splice(del, 1);
          c--;
          del--;
        }
      }
    }
  }

  //
  // lets pick some candidates and figure out the mechanics
  // need at least one damage move
  //

  // can we use wordnet on this
  let moveSim = [];
  if (quickCheck(w.name)) {
    for (let c in candidate) {
      let tagSuffixIndex = candidate[c].indexOf("/");
      let word = candidate[c].slice(0, tagSuffixIndex);
      let tag = candidate[c].slice(tagSuffixIndex + 1, candidate[c].length);
      if (quickCheck(word)) {
        moveSim.push({
          m: word,
          t: tag,
          s: word2VecUtils.getSimilarity(word, w.name),
        });
      }
    }
  } else {
    // look for wordnet hits in the keywords
    let wnKwds = keywords.filter((k) => quickCheck(k));
    wnKwds = wnKwds.filter((item, index) => wnKwds.indexOf(item) === index);
    for (let c in candidate) {
      let tagSuffixIndex = candidate[c].indexOf("/");
      let word = candidate[c].slice(0, tagSuffixIndex);
      let tag = candidate[c].slice(tagSuffixIndex + 1, candidate[c].length);
      if (quickCheck(word)) {
        let kwdSum = [0];
        for (let i in wnKwds) {
          // watch out for a == a from extract
          if ((wnKwds[i] != word) & quickCheck(word)) {
            kwdSum.push(word2VecUtils.getSimilarity(word, wnKwds[i]));
          }
        }
        // fudging the numbers :)
        // remove lowest percantile
        kwdSum = kwdSum.filter((n) => n >= 0.05);
        moveSim.push({
          m: word,
          t: tag,
          s:
            kwdSum.reduce((a, b) => a + b) / kwdSum.length ?? kwdSum[0] ?? null,
        });
      }
    }
  }
  moveSim.sort((a, b) => b.s - a.s);

  let moves = [];
  // let move = {
  //   name: "", // visible name
  //   type: "", // att, bff, dbf
  //   source: "", // self-stat
  //   target: ""  // target-stat
  // }

  // move construction
  for (let m in moveSim) {
    let word = moveSim[m].m;
    let tag = moveSim[m].t;

    let wordToStatKeys = {};
    if (quickCheck(word)) {
      for (let s in Object.keys(STAT_KEYS)) {
        let statName = Object.keys(STAT_KEYS)[s];
        wordToStatKeys[statName] = word2VecUtils.getSimilarity(word, statName);
      }
    } else {
      wordToStatKeys = w.stat;
    }
    // find source and target stat
    let sortedStat = [];
    for (let s in Object.keys(STAT_KEYS)) {
      let statName = Object.keys(STAT_KEYS)[s];
      sortedStat.push([statName, wordToStatKeys[statName]]);
    }
    sortedStat.sort((a, b) => b[1] - a[1]);

    switch (true) {
      case tag == "REP":
      case tag == "NNP":
        moves.push({
          name: word.toUpperCase(),
          type: "Spell",
          source: sortedStat[0][0],
          target: sortedStat[sortedStat.length - 1][0],
        });
        break;
      case tag == "NNS":
        moves.push({
          name: word.toUpperCase(),
          type: "Lower",
          source: sortedStat[0][0],
          target: sortedStat[sortedStat.length - 1][0],
        });
        break;
      case tag.slice(0, 2) == "VB" || tag.slice(0, 2) == "NN":
        moves.push({
          name: word.toUpperCase(),
          type: "Increase",
          source: sortedStat[1][0],
          target: sortedStat[0][0],
        });
        break;
    }
  }

  // maybe do a move picker at some point...
  moves = moves.slice(0, 5);
  // final check before shipping
  // make sure there's a damage move
  let attMove = moves.some((item) => item.type == "Spell");

  if (!attMove) {
    if (moves.length == 4) {
      moves.pop();
    }
    let maxStat = Object.keys(w.stat).reduce((i, j) => {
      if (w.stat[i] > w.stat[j]) {
        return i;
      } else {
        return j;
      }
    });
    let minStat = Object.keys(w.stat).reduce((i, j) => {
      if (w.stat[i] < w.stat[j]) {
        return i;
      } else {
        return j;
      }
    });
    for (let c in candidate) {
      let word = candidate[c].slice(0, candidate[c].indexOf("/"));
      let tag = candidate[c].slice(candidate[c].indexOf("/") + 1);
      if (tag == "REP") {
        moves.push({
          name: word.toUpperCase(),
          type: "Spell",
          source: maxStat,
          target: minStat,
        });
        break;
      }
    }
    // check if we fixed it with an unused candidate
    attMove = moves.some((item) => item.type == "Spell");
    if (!attMove) {
      // I think if we're going to get all the way here, lets just give them a good one...
      let firstVerb = "SPELL";
      for (let t in tagged) {
        if (tagged[t].pos.slice(0, 2) == "VB") {
          firstVerb = tagged[t].value.toUpperCase();
          break;
        }
      }
      moves.push({
        name: w.name.toUpperCase() + "'S " + firstVerb,
        type: "Spell",
        source: maxStat,
        target: minStat,
      });
    }
  }
  return moves;
}

//  This is a not a simple path...
//  If we don't have topic similarity (ie topic not in corpus)
//      - likely we're not going to get a wordnet match
//        maybe this is a proper noun, or a meme haha
//  We will build our stats from the wiki extract
//
//  If we build a stat obj from topic similarity, the wiki
//  and wordnet results will only reinforce the original stat.
//

// with stats from topic word, review wiki for bonus terms
// there's a chance here that we couldn't match topic to w2v,
//        in that case, use this for stat
function doStatMath(w) {
  let extract = stringToKeywords(w.wiki.extract);

  if (quickCheck(w.name)) {
    // found in w2v
    w.stat = wordToStat(w.name);
    // topic stat, then do wiki bonus
    for (let l in extract) {
      let v = wordToStatMax(extract[l]);
      if (v) {
        let sMod = Object.keys(v)[0];
        if (w.stat[sMod] <= v[sMod]) {
          w.stat[sMod] = (w.stat[sMod] + v[sMod]) / 2;
        }
      }
    }
  } else {
    // wiki only
    w.stat = {};
    let sPool = [];
    for (let l in extract) {
      let v = wordToStat(extract[l]);
      if (v) {
        sPool.push(v);
      }
    }
    for (let s in STAT_KEYS) {
      // what if we took the max value from every given match,
      // same as wordToStat
      let statFinal = 0;
      for (let p in sPool) {
        if (sPool[p][s] > statFinal) {
          statFinal = sPool[p][s];
        }
      }
      w.stat[s] = statFinal;
    }
  }
  // at this point our stats should be locked in

  // utilize a stat pool to allocate stats corresponding to the decimal values
  let statSum = 0;
  for (let s in w.stat) {
    statSum += w.stat[s];
  }
  for (let s in w.stat) {
    w.stat[s] = Math.round((w.stat[s] / statSum) * STAT_POOL_TOTAL);
  }
  return w.stat;
}

function quickCheck(word) {
  return word2VecUtils.contains(word);
}

async function suggestWiki(word) {
  try {
    const w = await wiki.search(word);
    if (w.results[0].title) {
      return w.results[0].title;
    } else {
      return false;
    }
  } catch (e) {
    return false;
  }
}

function wordToStatMax(word) {
  if (!quickCheck(word)) {
    return null;
  }
  let v = wordToStat(word);
  let s = "";
  let m = 0;
  for (let k in Object.keys(v)) {
    if (v[k] > m) {
      s = k;
    }
  }
  return { s: v[s] };
}

function wordToStat(word) {
  if (!quickCheck(word)) {
    return null;
  }
  let statReturn = {};
  for (let stat in STAT_KEYS) {
    let statHelper = STAT_KEYS[stat]["syn"];
    let statCollect = [];
    for (let term in statHelper) {
      let metric = word2VecUtils.getSimilarity(statHelper[term], word);
      statCollect.push(metric);
    }
    // what if we took the max value from every given synonym
    let statFinal = 0;
    for (let s in statCollect) {
      if (statCollect[s] > statFinal) {
        statFinal = statCollect[s];
      }
    }
    statReturn[stat] = statFinal;
  }
  return statReturn;
}

function stringToKeywords(word) {
  let split = word.replace(/[.,\/#?!$%\^&\*\"{}=\_`~;:()]/g, " ");
  split = split.replace(/\'/g, "");
  split = split.replace(/\n/g, " ");
  split = split.replace(/\s+/g, " ");
  split = split.split(" ");
  let kwd = [];
  for (let w in split) {
    if (
      STOP_WORDS.indexOf(split[w].toLowerCase()) < 0 &&
      split[w].length > 1 &&
      isNaN(parseInt(split[w].charAt(0)))
    ) {
      kwd.push(split[w]);
    }
  }
  return kwd;
}

function anyAscii(string) {
  let block = require("./data/blocks.js");
  let blocks = {};
  let result = "";
  for (const c of string) {
    const codePoint = c.codePointAt(0);
    if (codePoint <= 0x7f) {
      result += c;
      continue;
    }
    const blockNum = codePoint >>> 8;
    const lo = codePoint & 0xff;
    let b = blocks[blockNum];
    if (b === undefined) {
      blocks[blockNum] = b = block(blockNum).split("\t");
    }
    if (b.length > lo) {
      result += b[lo];
    }
  }
  return result;
}

app.get("/research/:input", function (req, res) {
  let topic = req.params.input.trim();
  let w = {
    id: topic,
  };
  return Promise.try(() => {
    return wikiPage(topic);
  })
    .then((r) => {
      w.wiki = r;
      return w;
    })
    .then(() => {
      return wordnetLookup(topic);
    })
    .then((r) => {
      w.wordnet = r;
      res.status(200).send(w);
    })
    .catch((e) => {
      console.error(e);
    });
});

app.get("/wiki/:input", function (req, res) {
  // console.log("wiki lookup for input: " + req.params.input);
  let topic = req.params.input.trim();
  let w = {
    id: topic,
    summary: "",
  };
  wikiPage(topic)
    .then((result) => res.status(200).send(result))
    .catch((err) => res.status(200).json(err));
});

app.get("/wordnet/:input", function (req, res) {
  // console.log("wordnet lookup for input: " + req.params.input);
  wordnet
    .lookup(req.params.input)
    .then((definitions) => {
      definitions.forEach((def) => {
        // console.log(`type: ${def.meta.synsetType}`);
        // console.log(`${def.glossary}\n`);
      });
      return definitions;
    })
    .then((result) => {
      res.status(200).send(result[0].meta);
    })
    .catch((e) => {
      console.error(e);
    });
});

app.get("/ddgimg/:input", function (req, res) {
  let topic = req.params.input.trim();
  ddgImg
    .image_search({ query: topic, moderate: false })
    .then((results) => {
      // console.log(results)
      return results.slice(0, 10);
    })
    .then((result) => {
      res.status(200).send(result);
    });
});

app.get("/randomCpu", async function (req, res) {
  let topic = randomWord();
  let validTopic = false;
  while (!validTopic) {
    topic = await suggestWiki(randomWord());
    if (topic) {
      validTopic = true;
    }
  }
  let w = {
    id: "cpu",
    name: topic,
    wn: {},
    stat: {},
    wiki: {},
  };
  const r = Promise.try(() => {
    return wikiPage(topic);
  })
    .then((r) => {
      w.wiki = r;
      if (!r) {
        // return Promise.resolve(
        // return res.status(200).json({data:
        throw new Error("no wiki for topic: " + w.name);
        // }))
      }
      return w;
    })
    .then(async (w) => {
      w.wn = await wordnetLookup(topic);
      return w;
    })
    .then((w) => {
      w.stat = doStatMath(w);
      w.move = getMoves(w);
      w.hp = calculateHp(w);
      return w;
    })
    .then(() => {
      return res.status(200).json({ data: w });
    })
    .catch((e) => {
      console.log(e.message);
      return res.status(200).json({
        data:
          "Couldn't find results for " +
          topic +
          ", try something I can find online please :)",
      });
    });
});

app.get("/mm/check/:id", function (req, res) {
  let id = req.params.id.trim();
  let c = mm.check(id);
  return res.status(200).json({ data: c });
});

app.get("/mm/cleanup/:id", function (req, res) {
  let id = req.params.id.trim();
  let c = mm.cleanUpMatch(id);
  return res.status(200).json({ data: c });
});

app.post("/mm/cpu", function (req, res) {
  // console.log(JSON.stringify(req.body["data"]))
  mm.startCpuMatch(req.body["data"]);
});

app.post("/mm/doMove/:id", function (req, res) {
  // console.log(JSON.stringify(req.body["data"]))
  let id = req.params.id.trim();
  let r = mm.doMove(id, req.body["data"]);
  if (r) {
    return res.status(200).json({ data: r });
  } else {
    res.status(200).json({ data: null });
  }
});

var server = app.listen(8081, function () {
  var port = server.address().port;
  console.log("app listening at port %s", port);
});
