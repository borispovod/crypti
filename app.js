var express = require('express'),
    config = require('./config'),
    routes = require('./routes'),
    db = require('./db.js'),
    async = require('async'),
    logger = require("./logger").logger,
    blockchain = require("./block").blockchain,
    accountprocessor = require("./account").accountprocessor,
    forgerprocessor = require("./forger").forgerprocessor,
    transactionprocessor = require("./transactions").transactionprocessor,
    addressprocessor = require("./address").addressprocessor;

var app = express();

app.configure(function () {
    app.set("version", "0.1");
    app.set("address", config.get("address"));
    app.set('port', config.get('port'));
    app.use(app.router);
});

app.configure("development", function () {
    app.use(express.logger('dev'));
    app.use(express.errorHandler());
});

async.series([
    function (cb) {
        logger.init("logs.log");
        logger.getInstance().info("Logger initialized");
        app.logger = logger.getInstance();
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing account processor...");
        app.accountprocessor = accountprocessor.init();
        logger.getInstance().info("Account processor initialized");
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing transaction processor...");
        app.transactionprocessor = transactionprocessor.init();
        app.transactionprocessor.setApp(app);
        logger.getInstance().info("Transaction processor initialized");
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing blockchain...");
        var bc = blockchain.init(app);

        if (!bc) {
            logger.getInstance().error("Genesis block generation failed");
            cb(false);
        } else {
            logger.getInstance().info("Blockchain initialized");
            cb();
        }
    },
    function (cb) {
        logger.getInstance().info("Initializing forger processor...");
        app.forgerprocessor = forgerprocessor.init(app);
        cb();
    },
    function (cb) {
        logger.getInstance().info("Initializing address processor...");
        app.addressprocessor = new addressprocessor();
        cb();
    }
], function (err) {
    if (err) {
        logger.getInstance().info("Crypti stopped!");
        logger.getInstance().error("Error: " + err);
    } else {
        app.listen(app.get('port'), app.get('address'), function () {
            logger.getInstance().info("Crypti started: " + app.get("address") + ":" + app.get("port"));
            routes(app);
        });
    }
});