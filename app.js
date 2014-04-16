var express = require('express'),
    config = require('./config'),
    routes = require('./routes'),
    db = require('./db.js'),
    async = require('async'),
    blockchain = require('./block').blockchain,
    ed = require('ed25519');

var transaction = require('./transactions');

var app = express();

app.configure(function () {
    app.set("address", config.get("address"));
    app.set('port', config.get('port'));

    app.use(function (req, res, next) {
        req.db = db.db;
        next();
    });

    app.use(app.router);
});

app.configure("development", function () {
    app.use(express.logger('dev'));
    app.use(express.errorHandler());
});

async.series([
    function (cb) {
        db.initDb(cb);
    },
    function (cb) {
        blockchain.init(db.db, function (err, bc) {
            if (err) {
                cb(err);
            } else {
                cb();
            }
        })
    }
], function (err) {
    if (err) {
        console.log(err);
    } else {
        app.listen(app.get('port'), app.get('address'), function () {
            console.log("Crypti started: " + app.get("address") + ":" + app.get("port"));
            routes(app);
        });
    }
});