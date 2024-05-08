"use strict";

const Bluebird = require("bluebird");
const e = require("express");

const bigQueue = [];
let matches = [];

const addToQueue = (o) => {
  if (!bigQueue.some((a) => a.id == o.id)) {
    bigQueue.push(o);
    return true;
  }
  return false;
};

const printQueue = () => {
  let p = "";
  for (let e in bigQueue) {
    p += "[ ";
    for (let k in Object.keys(bigQueue[e])) {
      let keyName = Object.keys(bigQueue[e])[k];
      p += keyName + ": " + JSON.stringify(bigQueue[e][keyName]) + ", ";
    }
    p += "] ";
  }
  return p;
};

const startPrivateMatch = (uuid) => {
  bigQueue.some((item, k) => {
    if (item.id == uuid) {
      let cpu = makeCpu();
      matches.push({ p1: item, p2: cpu });
      bigQueue.slice(k);
    }
  });
};

function makeTurnQueue({ p1, p2 }) {
  console.log("p2 id ", p1.id);
  console.log("p2 id ", p2.id);
  let turnQueue = [];
  let max,
    min = [];
  if (p1.stat.speed > p2.stat.speed) {
    max = [p1.id, p1.stat.speed];
    min = [p2.id, p2.stat.speed];
  } else {
    max = [p2.id, p2.stat.speed];
    min = [p1.id, p1.stat.speed];
  }
  let i = 0;
  while (i < 11) {
    i++;
    if (max[1] * i - min[1] * i > max[1]) {
      turnQueue.push(max[0]);
    }
    turnQueue.push(max[0]);
    turnQueue.push(min[0]);
  }
  return turnQueue;
}

const startCpuMatch = ({ p1, p2 }) => {
  let inGame = matches.some(
    (item) => item.p1 == p1 || item.p2 == p1 || item.p1 == p2 || item.p2 == p2
  );
  if (!inGame) {
    // setup speed queue
    // for this im using arrays as pairs of id and spd
    let turnQueue = makeTurnQueue({ p1, p2 });
    // finalize
    let m = { type: "cpu", q: turnQueue, p1: p1, p2: p2 };
    matches.push(m);
    return m;
    // console.log(JSON.stringify(matches));
  } else {
    console.log("already in game: " + JSON.stringify([p1, p2]));
    return inGame;
  }
};

const doMove = (game, { id, move }) => {
  let inGame = findMatch(game);
  console.log("====" + game);
  if (inGame) {
    // is it your turn?
    let qPos = inGame.q[0];
    if (qPos != id) {
      console.log("wait your turn :)");
      return null;
    }
    // console.log(id + " doing " + move)
    // console.log("inGame:: " + JSON.stringify(inGame));
    // set last move for update ref
    // rotate game q
    let tempQ = inGame.q;
    tempQ.push(tempQ.shift());
    inGame.q = tempQ;
    // data modify -> hp or stat
    let src = inGame.p1.id;
    let tgt = {};
    if (src == id) {
      src = inGame.p1;
      tgt = inGame.p2;
    } else {
      src = inGame.p2;
      tgt = inGame.p1;
    }
    // find src stat and target stat
    console.log("DO MOVE:: " + move);
    console.log("SOURCE: " + JSON.stringify(src.name));
    // console.log("TARGET: " + JSON.stringify(tgt))
    let moveFromSrc = src.move.find((item) => item.name == move);
    let moveSrc = moveFromSrc.source.toLowerCase();
    let moveTgt = moveFromSrc.target.toLowerCase();
    let moveType = moveFromSrc.type.toLowerCase();
    let srcStat = src.stat[moveSrc];
    // console.log(moveSrc + ": " + srcStat);

    let moveRef = "";
    if (moveType == "increase") {
      let tgtStat = parseInt(src.stat[moveTgt]);
      //   console.log(moveTgt + ": " + tgtStat);
      src.stat[moveTgt] = tgtStat + Math.round(srcStat * (srcStat / tgtStat));
      //   console.log(moveTgt + " modified to: " + src.stat[moveTgt]);
      moveRef =
        src.name +
        " used " +
        move +
        "! " +
        "Increased " +
        moveTgt +
        " to " +
        src.stat[moveTgt] +
        "!";
    } else {
      let tgtStat = tgt.stat[moveTgt];
      //   console.log(moveTgt + ": " + tgtStat);
      if (moveType == "spell") {
        // console.log("HP: " + tgt.hp);
        tgt.hp = tgt.hp - Math.round(srcStat * (srcStat / tgtStat));
        if (tgt.hp < 0) {
          tgt.hp = 0;
        }
        moveRef =
          src.name +
          " used " +
          move +
          "! " +
          "Hit for " +
          Math.round(srcStat * (srcStat / tgtStat)) +
          " HP!";

        // console.log("HP to >> " + tgt.hp);
      }
      if (moveType == "lower") {
        tgt.stat[moveTgt] =
          tgt.stat[moveTgt] - Math.round(srcStat * (srcStat / tgtStat));
        if (tgt.stat[moveTgt] < 25) {
          tgt.stat[moveTgt] = 25;
          moveRef =
            src.name +
            " used " +
            move +
            "! " +
            "Lowered " +
            moveTgt +
            " to " +
            tgt.stat[moveTgt] +
            "!";
        } else {
          moveRef =
            src.name +
            " used " +
            move +
            "! " +
            tgt.name +
            " " +
            moveTgt +
            " is as low as it can be!";
        }

        // if we lower spd we need to re-do turnQ
        // BUG-FIX: Users can infinitely combo lowering speed,
        // to reolve, make other user go next, then makeTurnQueue
        if (moveTgt == "speed") {
          inGame.q = [tgt.id].concat(makeTurnQueue({ p1: src, p2: tgt }));
          console.log("QUEUE: " + JSON.stringify(inGame.q));
        }
      }
    }
    inGame["lastMove"] = moveRef;
    // order doesn't matter
    inGame.p1 = src;
    inGame.p2 = tgt;
    matches.find((item, k, arr) => {
      if (item.p1.id == id || item.p2.id == id) {
        arr.splice(k, 1);
      }
    });
    console.log("HP CHECK:" + inGame.p1.hp + " " + inGame.p2.hp);
    matches.push(inGame);
    return inGame;
  }
  return null;
};

function findMatch(id) {
  let m = matches.find((item, k, arr) => {
    if (item.p1.id == id || item.p2.id == id) {
      return item;
    }
  });
  return m;
}

const check = function (id) {
  // console.log("check " + id)
  // console.log("MATCHES::: " + JSON.stringify(matches))
  let m = findMatch(id);
  if (m) {
    return m.q[0];
  } else {
    return null;
  }
};

const cleanUpMatch = function (id) {
  console.log("cleanup " + id + ". matches size: " + matches.length);
  let m = matches.findIndex((item) => {
    if (item.p1.id == id || item.p2.id == id) {
      return item;
    }
  });
  matches.splice(m, 1);
  console.log("matches size: " + matches.length);
  return m;
};

module.exports = {
  addToQueue,
  printQueue,
  startPrivateMatch,
  startCpuMatch,
  doMove,
  check,
  cleanUpMatch,
};
