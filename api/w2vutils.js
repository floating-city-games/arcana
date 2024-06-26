'use strict'

const wordVecs = require("./data/wordvecs25000.js");
// console.log(JSON.stringify(wordVecs))

var WORDS = Object.keys(wordVecs);
// console.log(WORDS)

const diffN = (n, word1, word2) => {
    for (var ai = 1; ai < arguments.length; ai++) {
        if (!wordVecs.hasOwnProperty(arguments[ai])) {
            return [false, arguments[ai]];
        }
    }

    return getNClosestMatches(
        n,
        subVecs(wordVecs[word1], wordVecs[word2])
    );
}

const composeN = (n, word1, word2) => {
    for (var ai = 1; ai < arguments.length; ai++) {
        if (!wordVecs.hasOwnProperty(arguments[ai])) {
            return [false, arguments[ai]];
        }
    }

    return getNClosestMatches(
        n,
        addVecs(wordVecs[word1], wordVecs[word2])
    );
}

const mixAndMatchN = (n, sub1, sub2, add1) => {
    for (var ai = 1; ai < arguments.length; ai++) {
        if (!wordVecs.hasOwnProperty(arguments[ai])) {
            return [false, arguments[ai]];
        }
    }

    return getNClosestMatches(
        n,
        addVecs(wordVecs[add1], subVecs(wordVecs[sub1], wordVecs[sub2]))
    );
}

const findSimilarWords = (n, word) => {
    if (!wordVecs.hasOwnProperty(word)) {
        return [false, word];
    }

    return getNClosestMatches(
        n, wordVecs[word]
    );
}

const getNClosestMatches = (n, vec) => {
    var sims = [];
    for (var word in wordVecs) {
        var sim = getCosSim(vec, wordVecs[word]);
        sims.push([word, sim]);
    }
    sims.sort(function (a, b) {
        return b[1] - a[1];
    });
    return sims.slice(0, n);
}

const getSimilarity = (word1, word2) => {
    let vec1 = wordVecs[word1]
    let vec2 = wordVecs[word2]
    if (vec1 == null || vec2 == null){
        return null
    }
    return getCosSim(vec1, vec2);
}

const getCosSim = (f1, f2) => {
    return Math.abs(f1.reduce(function (sum, a, idx) {
        return sum + a * f2[idx];
    }, 0) / (mag(f1) * mag(f2))); //magnitude is 1 for all feature vectors
}

function mag(a) {
    return Math.sqrt(a.reduce(function (sum, val) {
        return sum + val * val;
    }, 0));
}

function norm(a) {
    var mag = mag(a);
    return a.map(function (val) {
        return val / mag;
    });
}

function addVecs(a, b) {
    return a.map(function (val, idx) {
        return val + b[idx];
    });
}

function subVecs(a, b) {
    return a.map(function (val, idx) {
        return val - b[idx];
    });
}

function contains(w){
    // console.log(w + " " + wordVecs[w])
    return wordVecs[w] != undefined
}

module.exports = {
    diffN: diffN,
    composeN: composeN,
    findSimilarWords: findSimilarWords,
    contains: contains,
    getNClosestMatches: getNClosestMatches,
    getSimilarity: getSimilarity
};