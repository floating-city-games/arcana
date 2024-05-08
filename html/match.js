"use strict";

const serverUrl = "http://localhost:8081/";
let cpuInterval = "";
let lastMoveTimeoutId = "";
let playing = true;

$(document).ready(function () {
  let url = new URL(window.location.href);
  let m = url.searchParams.get("m");
  let sInfo = sessionStorage["summon"] ?? null;
  if (sInfo) {
    let info = JSON.parse(sInfo);
    addYouMoves(info.id, info.move);
    updateUi();

    // match type
    if (m == "cpu") {
      let cpuInfo = JSON.parse(sessionStorage["cpuSummon"]);
      let cpupath = serverUrl + "mm/cpu";
      let cpuMatch = { p1: info, p2: cpuInfo };
      console.log("cpu match: " + JSON.stringify(cpuMatch));
      $.post(cpupath, { data: cpuMatch });

      // setup CPU fire move ai on timer
      cpuInterval = setInterval(function () {
        let cpuInfo = JSON.parse(sessionStorage["cpuSummon"]);
        if (cpuInfo.hp > 0) {
          cpuMove();
        }
      }, 3000);
    }
  } else {
    window.location.href = "index.html";
  }
  // server check loop
  setInterval(function () {
    let info = JSON.parse(sessionStorage["summon"]);
    let url = new URL(window.location.href);
    let m = url.searchParams.get("m");
    if (m == "cpu") {
      let cpuInfo = JSON.parse(sessionStorage["cpuSummon"]);
      if (cpuInfo.hp < 1) {
        return;
      }
    }
    if (info.hp > 0) {
      checkServer();
    }
  }, 2000);
});

function checkServer() {
  let info = JSON.parse(sessionStorage["summon"]);
  let serverCheckUrl = serverUrl + "mm/check/" + info.id;
  $.get(serverCheckUrl, function (data) {
    let info = JSON.parse(sessionStorage["summon"]);
    console.log("Turn: " + data["data"]);
    if (data && info.id == data["data"]) {
      $(".moveButton").prop("disabled", false);
      $("#youImgId").addClass("activeSummon");
      $("#opImgId").removeClass("activeSummon");
    } else {
      $(".moveButton").prop("disabled", true);
      $("#opImgId").addClass("activeSummon");
      $("#youImgId").removeClass("activeSummon");
    }
  });
}

function cpuMove() {
  let checkUrl = serverUrl + "mm/check/" + JSON.parse(sessionStorage["id"]);
  console.log(checkUrl);
  $.get(checkUrl, function (data) {
    console.log(data["data"]);
    if (data["data"] && data["data"] == "cpu") {
      let cpuSessionInfo = sessionStorage["cpuSummon"] ?? null;
      let cpuInfo = JSON.parse(cpuSessionInfo);
      let randMove = Math.floor(Math.random() * cpuInfo.move.length);
      let cpuMoveChoice = cpuInfo.move[randMove].name;
      console.log("cpu move: " + cpuMoveChoice);
      let movePath =
        serverUrl + "mm/doMove/" + JSON.parse(sessionStorage["id"]);
      let d = $.post(
        movePath,
        { data: { id: "cpu", move: cpuMoveChoice } },
        function (data) {
          afterMove(data);
        }
      );
    }
  });
}

function afterMove(data) {
  if (data["data"]) {
    let playerId = JSON.parse(sessionStorage["id"]);
    // save new data to update ui
    // console.log(JSON.stringify(data["data"]));
    let p1 = data["data"].p1;
    let p2 = data["data"].p2;
    if (p1.id == "cpu") {
      sessionStorage.setItem("cpuSummon", JSON.stringify(p1));
    }
    if (p2.id == "cpu") {
      sessionStorage.setItem("cpuSummon", JSON.stringify(p2));
    }
    if (p1.id == playerId) {
      sessionStorage.setItem("summon", JSON.stringify(p1));
    }
    if (p2.id == playerId) {
      sessionStorage.setItem("summon", JSON.stringify(p2));
    }
    let lMove = data["data"].lastMove;
    $("#lastMoveId").html(lMove);
    $("#lastMoveId").show();
    clearInterval(lastMoveTimeoutId);
    lastMoveTimeoutId = setTimeout(function () {
      $("#lastMoveId").hide();
    }, 3000);
    let log = $("#consoleId").html()
    $("#consoleId").html(lMove + "<br/>" + log)
    updateUi();
    return data["data"];
  }
  return null;
}

function updateUi() {
  if (sessionStorage["streak"] && JSON.parse(sessionStorage["streak"]) > 0) {
    let sreakCounter = parseInt(JSON.parse(sessionStorage["streak"]));
    $("#streakId").html("STREAK: " + sreakCounter);
  }
  // update both health stats
  let info = JSON.parse(sessionStorage["summon"]);
  let sImage = JSON.parse(sessionStorage["summonImage"]);
  $("#youImgId").attr("src", sImage);
  $("#youTitleId").html(info.name);
  $("#youHpId").html("HP: " + info.hp);
  // add stats to the hover of the img
  let altText = "";
  for (let s in info.stat) {
    altText += s + ": " + info.stat[s] + "\n";
  }
  altText.slice(0, altText.length - 1);
  $("#youImgId").attr("title", altText);
  $("#youImgId").attr("alt", altText);
  // check you are dead :o
  if (info.hp < 1) {
    playing = false;
    $("#lastMoveId").html("YOU DIED");
    cleanupMatch(info.id);
  }
  // check cpu
  let url = new URL(window.location.href);
  let m = url.searchParams.get("m");
  if (m == "cpu") {
    let cpuImage = JSON.parse(sessionStorage["cpuSummonImage"]);
    let cpuInfo = JSON.parse(sessionStorage["cpuSummon"]);
    $("#opTitleId").html(cpuInfo.name);
    $("#opImgId").attr("src", cpuImage);
    $("#opHpId").html("HP: " + cpuInfo.hp);

    // match end checks
    if (cpuInfo.hp < 1) {
      clearInterval(cpuInterval);
      cleanupMatch(info.id);
      playing = false;
      $("#lastMoveId").html(info.name + " DEFEATS " + cpuInfo.name);
      return;
    }
    if (info.hp < 1) {
      // clear it if you died as well
      // but we should have done all the ui work above
      clearInterval(cpuInterval);
      return;
    }
  }
}

function cleanupMatch(id) {
  let cleanUrl = serverUrl + "mm/cleanup/" + id;
  $.get(cleanUrl, function (data) {
    console.log("final: " + JSON.stringify(data));
  });
  nextMatchButton();
}

function nextMatchButton() {
  let rawCpuInfo = sessionStorage["cpuSummon"];
  let cpuInfo = JSON.parse(rawCpuInfo);
  let rawInfo = sessionStorage["summon"];
  let info = JSON.parse(rawInfo);
  if (info.hp < 1) {
    $("#tryAgainButtonId").show();
    $("#tryAgainButtonId").on("click", function () {
      let info = JSON.parse(sessionStorage["summon"]);
      let statpath = serverUrl + "stat/" + info.name;
      console.log(statpath);
      $.get(statpath, function (data, status) {
        let playerId = JSON.parse(sessionStorage["id"]);
        let sv = {
          id: playerId,
          name: data["data"].name,
          hp: data["data"].hp,
          stat: data["data"].stat,
          move: data["data"].move,
        };
        sessionStorage.setItem("summon", JSON.stringify(sv));
        return sv;
      })
        .then(() => {
          let cpuInfo = JSON.parse(sessionStorage["cpuSummon"]);
          let statpath = serverUrl + "stat/" + cpuInfo.name;
          console.log(statpath);
          return $.get(statpath, function (data, status) {
            let sv = {
              id: "cpu",
              name: data["data"].name,
              hp: data["data"].hp,
              stat: data["data"].stat,
              move: data["data"].move,
            };
            sessionStorage.setItem("cpuSummon", JSON.stringify(sv));
          });
        })
        .then(() => {
          updateUi();
          sessionStorage.setItem("streak", 0);
          $("#tryAgainButtonId").hide();
          $("#lastMoveId").hide();
          setTimeout(function () {
            window.location.reload();
          }, 2000);
        });
    });
  }
  if (cpuInfo.hp < 1) {
    $("#nextMatchButtonId").show();
    $("#nextMatchButtonId").on("click", function () {
      // restart page
      setTimeout(function () {
        window.location.reload();
      }, 3000);
      // update streak
      if (sessionStorage["streak"]) {
        let streak = parseInt(JSON.parse(sessionStorage["streak"])) + 1;
        console.log("streak: " + streak);
        sessionStorage.setItem("streak", streak);
      } else {
        sessionStorage.setItem("streak", 1);
      }
      // normal info
      let info = JSON.parse(sessionStorage["summon"]);
      let statpath = serverUrl + "stat/" + info.name;
      $.get(statpath, function (data, status) {
        let playerId = JSON.parse(sessionStorage["id"]);
        let sv = {
          id: playerId,
          name: data["data"].name,
          hp: data["data"].hp,
          stat: data["data"].stat,
          move: data["data"].move,
        };
        sessionStorage.setItem("summon", JSON.stringify(sv));
      }).then(() => {
        let randCpuPath = serverUrl + "randomCpu";
        $.get(randCpuPath, function (data, status) {
          console.log("cpu upkeep step:: " + JSON.stringify(data));
          if (data["data"].name) {
            let cpuStat = {
              id: "cpu",
              name: data["data"].name,
              hp: data["data"].hp,
              stat: data["data"].stat,
              move: data["data"].move,
            };
            sessionStorage.setItem("cpuSummon", JSON.stringify(cpuStat));
          } else {
            $("#nextMatchButtonId").click();
          }
        })
          .then(async (topic) => {
            console.log("DATA: " + JSON.stringify(topic["data"].name));
            let imgPath = serverUrl + "ddgimg/" + topic["data"].name;
            await $.get(imgPath, function (data, status) {
              let rPic = Math.floor(Math.random() * (data.length - 1));
              sessionStorage.setItem(
                "cpuSummonImage",
                JSON.stringify(data[rPic].image)
              );
              console.log(sessionStorage["cpuSummonImage"]);
            });
          })
          .then(() => {
            updateUi();
            $("#nextMatchButtonId").hide();
            $("#lastMoveId").hide();
          });
      });
    });
  }
}

function addYouMoves(id, moves) {
  let b = "";
  for (let m in moves) {
    b +=
      "<button id='" +
      moves[m].name +
      "' class='moveButton' name=" +
      moves[m].name +
      " value=" +
      moves[m].name +
      ">" +
      moves[m].name +
      "(" +
      moves[m].type +
      "): <br/>" +
      moves[m].source +
      "->" +
      moves[m].target +
      "</button><br/>";
  }
  $("#youMovesDivId").html(b);
  let playerId = JSON.parse(sessionStorage["id"]);
  // add post function for each button
  for (let m in moves) {
    $("#" + moves[m].name).click(function () {
      let movePath = serverUrl + "mm/doMove/" + playerId;
      let d = $.post(
        movePath,
        { data: { id: id, move: moves[m].name } },
        function (data) {
          afterMove(data);
        }
      );
    });
  }
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}
