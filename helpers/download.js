/**
 * @module Helpers.Download
 */

var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var unzip = require('unzip');
var Stream = require('stream');

module.exports.zip = downloadZip;
module.exports.stream = downloadStream;

/**
 * Download resource.
 * @param {string|object} addr Resource url
 * @param {function(Error|null, {})} callback Result Callback
 */
function downloadStream(addr, callback) {
    var protocol;

    if (typeof addr === "string") {
        addr = url.parse(addr);
    }

    protocol = url.parse(addr).protocol === "https:" ? https : http;

    protocol.request(addr, function(res){
        var statusCode = res.statusCode;

        if (statusCode === 301 || statusCode === 302) {
            return downloadStream(res.headers.location, callback);
        }

        if (statusCode !== 200 && statusCode !== 304) {
            console.log(res.headers);
            callback(new Error('Status code is ' + res.statusCode));
            return;
        }

        callback(null, res);
    }).end();
}

function download(addr, dest, callback) {
    var destStream = fs.createWriteStream(dest);

    downloadStream(addr, function(err, stream){
        if (err) return callback(err);

        stream.pipe(destStream);
        stream.on('end', function(){
            destStream.end();
            callback(null);
        });
    });
}

function downloadZip(addr, callback) {
    downloadStream(addr, function(err, res){
        if (err) return callback(err);


        var unzipper = unzip.Parse();
        var items = [];

        res.pipe(unzipper);

        unzipper.on('entry', function(entry){
            items.push(entry.path);
            entry.autodrain();
        });

        unzipper.on('close', function(){
            callback(null, items);
        });
    });
}

downloadZip("https://github.com/rumkin/blank-js/archive/master.zip", function(err, files){
    if (err) return console.error(err);

    console.log("files", files);
});