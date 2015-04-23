var express = require('express');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');
var mime = require('mime');

module.exports = function(dir, routes) {
    var app = express();

    app.use(function(req, res, next){
        var file = req.file = {
            path: path.join(dir, path.resolve('/', req.path)),
            exists: false,
            ext: path.extname(req.path)
        };

        fs.exists(file.path, function(exists){
            if (! exists) return next();

            file.exists = true;

            fs.stat(file.path, function(err, stat){
                if (err) return next(err);

                file.stat = stat;
                next();
            });
        });
    });

    app.use(function(req, res, next){
        if (!req.file.exists || req.file.ext !== '.ejs') return next();

        fs.readFile(req.file.path, 'utf8', function(err, content){
            if (err) return next(err);


            res.header('content-type', 'text/html');
            res.end(ejs.render(content, {req: req}));
        });
    });

    app.use(function(req, res, next){
        if (! req.file.exists || ! req.file.stat.isFile()) return next();

        res.header('content-type', mime.lookup(req.file.path));
        fs.readFile(req.file.path, function(err, content){
            if (err) return next(err);

            res.end(content);
        });
    });

    if (routes) {
        Object.keys(routes).forEach(function(key){
            var parts = key.split(' ');
            var method = 'get';
            var route;

            if (parts.length > 1) {
                method = parts.shift().toLowerCase();
            }

            route = parts.join(' ');

            app[method](route, routes[key]);
        });
    }

    return app;
};