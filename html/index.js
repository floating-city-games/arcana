serverUrl = "http://localhost:8081/";
sessionStorage.clear()

$(document).ready(function () {
  // clear out previous data and remove from queue
  $("#statsButtonId").click(function () {
    let match = false;
    let statpath = serverUrl + "stat/" + $("#arcanaInputId").val();
    $.get(statpath, function (data, status) {
      //   console.log(data)
      if (data["data"].wiki) {
        match = true;
        // construct pretty string for stats
        let output = data["data"].name.toUpperCase() + "<br/><br/>";
        const hpRes = data["data"].hp
        output += "HP: " + hpRes + "<br/><br/>"
        const statRes = data["data"].stat;
        output += "STATS<br/>";
        for (let i in statRes) {
          output += i + ": " + statRes[i] + "<br/>";
        }
        const moveList = data["data"].move;
        output += "<br/><br/>MOVES<br/>";
        for (let m in moveList) {
          output +=
            moveList[m].name +
            ": (" +
            moveList[m].type +
            ") " +
            moveList[m].source +
            " -> " +
            moveList[m].target +
            "<br/>";
        }
        output += "<br/><br/>";
        let desc = data["data"].wiki.extract;
        output += "DESCRIPTION:<br/>" + desc + "<br/><br/>";
        $("#summonSummaryId").html(output);
        // verify local id status
        let id = sessionStorage["id"] ?? null;
        if (!id) {
          id = uuidv4();
          sessionStorage.setItem("id", JSON.stringify(id));
        } else {
          id = JSON.parse(sessionStorage["id"])
        }
        // console.log("id: " + id);
        // save key info in session
        let sv = {
          id: id,
          name: data["data"].name,
          hp: data["data"].hp,
          stat: data["data"].stat,
          move: data["data"].move,
        };
        sessionStorage.setItem("summon", JSON.stringify(sv));
      } else {
        $("#summonSummaryId").html(data["data"]);
      }
    }).then(() => {
      if (match) {
        let imgPath = serverUrl + "ddgimg/" + $("#arcanaInputId").val();
        // console.log(path)
        $.get(imgPath, function (data, status) {
          // console.log(data)
          let c = $("#summonInnerCarousel");
          c.empty();
          let imgC = 0;
          data.forEach(function (i) {
            var $newdiv = $(
              "<div id='imgRes" + imgC + "' class='carousel-item' >  </div>"
            );
            $newdiv.append(
              "<img class='d-block w-100' src='" +
              i.thumbnail +
              "' width=300 height=300 >"
            );
            c.append($newdiv);
            imgC++;
          });
          let i = $("#imgRes0");
          if (i) {
            i.addClass("active");
          }
        });
      }
    });
  });
  $("#cpuPlayButtonId").click(function () {
    // make a cpu and start a private match
    let imgPick = $(".active").children("img").attr("src");
    sessionStorage.setItem("summonImage", JSON.stringify(imgPick));

    let randCpuPath = serverUrl + "randomCpu"
    $.get(randCpuPath, function (data, status) {
      if (data["data"].name) {
        let cpuStat = {
          id: "cpu",
          name: data["data"].name,
          hp: data["data"].hp,
          stat: data["data"].stat,
          move: data["data"].move,
        };
        // console.log(JSON.stringify(cpuStat))
        sessionStorage.setItem("cpuSummon", JSON.stringify(cpuStat));
        return data["data"].name
      } else {
        $("#cpuPlayButtonId").click()
      }
    })
      .then(async (topic) => {
        // console.log("DATA: " + JSON.stringify(topic["data"].name))
        let imgPath = serverUrl + "ddgimg/" + topic["data"].name
        await $.get(imgPath, function (data, status) {
          let rPic = Math.floor(Math.random() * (data.length - 1))
          sessionStorage.setItem(
            "cpuSummonImage",
            JSON.stringify(data[rPic].image)
          );
          // console.log(sessionStorage["cpuSummonImage"])
        });
      }).then(
        setTimeout(() => window.location.href = "match.html?m=cpu", 2500)
      ).catch((e) => {
        // probably got an error back, run another rando
        console.log(e)
      })
  });

  $("#queuePlayButtonId").click(function () {
    sessionStorage.setItem("summonImage", JSON.stringify($(".active").html()));
    window.location.href = "match.html?m=queue";
  });

  $("#privatePlayButtonId").click(function () {
    sessionStorage.setItem("summonImage", JSON.stringify($(".active").html()));
    window.location.href = "match.html?m=pvt";
  });

  $("#randomInputImgId").click(function () {
    let randCpuPath = serverUrl + "randomCpu"
    $.get(randCpuPath, function (data, status) {
      if (data["data"].wiki) {
        // set random name in input
        $("#arcanaInputId").val(data["data"].name)
        match = true;
        // construct pretty string for stats
        let output = data["data"].name.toUpperCase() + "<br/><br/>";
        const hpRes = data["data"].hp
        output += "HP: " + hpRes + "<br/><br/>"
        const statRes = data["data"].stat;
        output += "STATS<br/>";
        for (let i in statRes) {
          output += i + ": " + statRes[i] + "<br/>";
        }
        const moveList = data["data"].move;
        output += "<br/><br/>MOVES<br/>";
        for (let m in moveList) {
          output +=
            moveList[m].name +
            ": (" +
            moveList[m].type +
            ") " +
            moveList[m].source +
            " -> " +
            moveList[m].target +
            "<br/>";
        }
        output += "<br/><br/>";
        let desc = data["data"].wiki.extract;
        output += "DESCRIPTION:<br/>" + desc + "<br/><br/>";
        $("#summonSummaryId").html(output);
        // verify local id status
        let id = sessionStorage["id"] ?? null;
        if (!id) {
          id = uuidv4();
          sessionStorage.setItem("id", JSON.stringify(id));
        } else {
          id = JSON.parse(sessionStorage["id"])
        }
        // console.log("id: " + id);
        // save key info in session
        let sv = {
          id: id,
          name: data["data"].name,
          hp: data["data"].hp,
          stat: data["data"].stat,
          move: data["data"].move,
        };
        sessionStorage.setItem("summon", JSON.stringify(sv));
      }
    })
      .then(async (topic) => {
        let info = JSON.parse(sessionStorage["summon"])
        let imgPath = serverUrl + "ddgimg/" + info.name;
        // console.log(path)
        $.get(imgPath, function (data, status) {
          // console.log(data)
          let c = $("#summonInnerCarousel");
          c.empty();
          let imgC = 0;
          data.forEach(function (i) {
            var $newdiv = $(
              "<div id='imgRes" + imgC + "' class='carousel-item' >  </div>"
            );
            $newdiv.append(
              "<img class='d-block w-100' src='" +
              i.thumbnail +
              "' width=300 height=300 >"
            );
            c.append($newdiv);
            imgC++;
          });
          let i = $("#imgRes0");
          if (i) {
            i.addClass("active");
          }
        });
      })
  })
});

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}