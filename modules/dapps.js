var Router = require('../helpers/router.js');
var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');
var Download = require('download');


module.exports = Dapps;

var modules, library, self;

function Dapps(cb, scope) {
    self = this;
    library = scope;

    attachApi();

    setImmediate(cb, null, self);
}

function attachApi() {
    var router = new Router();

    router.get('/', function(req, res, next){
        req.sanitize('query', {
            id : 'int!'
        }, function(err, report, query){
            if (err) return next(err);
            if (! report.isValid) return res.json({success: false, error: report.issues});

            self.getDapp(query.id, function(err, dapp){
                if (err) return next(err);

                res.json({success:true, dapp:dapp});
            });
        });
    });

    router.get('/list', function(req, res, next){
        self.getList(function(err, list){
            if (err) return next(err);

            res.json({success:true, items: list});
        });
    });
    
    router.post('/', function(req, res, next){
        req.sanitize("body", {
            name : {
                required : true,
                string : true,
                maxLength : 16,
                minLength : 1
            },
            description : {
                default : '',
                string : true,
                maxLength : 140
            },
            url : {
                required : true,
                url : {
                    protocol : ["http:", "https:"],
                    hostname : "github.com",
                    pathname : /^([^/]+\/)+[^/]+$/
                }
            }
        }, function(err, report, body){
            if (err) return next(err);
            if (! report.isValid) return res.json({success:false, error: report.issues});

            self.addDapp(body, function(err, dapp){
                if (err) return next(err);

                res.json({succes:true, dapp:dapp});
            });
        });
    });

    router.get('/fetch', function(req, res, next){
        self.getDapp(req.query.id, function(err, dapp){
            if (err) return next(err);
            if (! dapp) return res.status(404).json({success:false});

            self.fetchDapp(dapp, function(err, files){
                if (err) return next(err);

                res.json({success:true, files:files});
            });
        });
    });

    library.app.use('/api/dapps/', router);
    library.app.use(function (err, req, res, next) {
        if (!err) return next();

        library.logger.error('/api/dapps', err);
        res.status(500).send({success: false, error: err});
    });
}

var dbFields = ['id', 'name', 'description', 'url'];
/**
 * Get dapp by id.
 * @param {number} id Dapp id.
 * @param {function(Error|null,{}|null)} cb Result callback.
 */
Dapps.prototype.getDapp = function(id, cb) {
    library.dbLite.query('SELECT id, name, description, url FROM dapps WHERE id = $id;', {id:id}, dbFields, function(err, rows){
        if (err) return cb(err);
        cb(null, rows[0] || null);
    });
};

Dapps.prototype.addDapp = function(dapp, cb){
    library.dbLite.query('INSERT INTO dapps(name, description, url) VALUES(?,?,?);', [dapp.name, dapp.description, dapp.url], function(err){
        if (err) return cb(err);

        dapp.id = library.dbLite.lastRowID;
        cb(err, dapp);
    });
};

// TODO Add list params page, size.
Dapps.prototype.getList = function(cb) {
    library.dbLite.query('SELECT id, name, description, url FROM dapps;', null, dbFields, cb);
};

/**
 * Fetch dapp source from repository url.
 * @param {object} dapp Dapp object
 * @param {function} cb Result callback
 */
Dapps.prototype.fetchDapp = function(dapp, cb) {
    var dappPath = path.join(path.resolve(process.cwd(), library.config.dappsDir), dapp.id);
    var gitUrl = url.parse(dapp.url);
    var repoName = gitUrl.pathname.replace(/^\/+|\/+$/,'').split('/').pop();
    var branch = gitUrl.hash || 'master';

    gitUrl.pathname += '/archive/' + branch + '.zip';
    gitUrl.hash = null;

    var download = new Download({extract:true})
        .get(url.format(gitUrl), dappPath);

    download.run(cb);
};