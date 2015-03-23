var Router = require('../helpers/router.js')
    , dbLite = require('../helpers/dbLite.js')
    , slots = require('../helpers/slots.js')
    , crypto = require('crypto')
    , ed = require('ed25519')
    ;


var self, modules, library;

module.exports = Usernames;

function Usernames(cb, scope) {
    self = this;
    library = scope;

    attachApi();

    this._cache = {};
    this._unconfirmed = {};

    cb(null, this);
}

Usernames.prototype.onBind = function(scope) {
    modules = scope;
};

/**
 * Add existing username to cache.
 * @param {string} username
 */
Usernames.prototype.cache = function(username){
    this._cache[username] = 1;
};

/**
 * Remove username from cache.
 * @param {string} username
 */
Usernames.prototype.uncache = function(username){
    delete this._cache[username];
};

/**
 * Add unconfirmed username to list of unconfirmed usernames.
 * @param {string} username
 */
Usernames.prototype.addUnconfirmedUsername = function(username){
    this._unconfirmed[username] = true;
};

/**
 * Return unconfirmed username status. If unconfirmed username exists returns true.
 * @param {string} username
 * @returns {boolean}
 */
Usernames.prototype.getUnconfirmedUsername = function(username){
    return !!this._unconfirmed[username];
};

/**
 * Remove username from list of unconfirmed usernames.
 * @param {string} username
 */
Usernames.prototype.removeUnconfirmedUsername = function(username){
    delete this._unconfirmed[username];
};

/**
 * Check if username already exists in `username` or `delegates` database.
 * @param {string} username Username to check
 * @param {function(Error|null,Boolean=)} callback Result callback
 */
Usernames.prototype.isRegistered = function(username, callback) {
    function onQuery(done, err, rows) {
        return function(){
            if (err !== null) return done(err);

            done(null, (rows.length && rows[0][0]) > 0);
        };
    }

    async.parallel({
        hasUsername : function(done){
            dbLite.query('SELECT count(username) as counter FROM usernames WHERE username = ?;', [username], [Number], onQuery(done));
        },
        hasDelegate : function(done){
            dbLite.query('SELECT count(delegate) as counter FROM delegates WHERE delegate = ?;', [username], [Number], onQuery(done));
        }
    }, function(err, result){
        if (err !== null) return callback(err);

        result = result.filter(function(item){
            return item;
        });

        callback(null, result.length);
    });
};

function attachApi() {
    var router = new Router();

    router.put('/', function(req, res, next){
        req.sanitize("body", {
            secret: "string!",
            publicKey: "string?",
            secondSecret: "string?",
            username: "string!"
        }, function (err, report, body) {
            if (err) return next(err);
            if (!report.isValid) return res.json({success: false, error: report.issues});

            var secret = body.secret,
                publicKey = body.publicKey,
                secondSecret = body.secondSecret,
                username = body.username;

            var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
            var keypair = ed.MakeKeypair(hash);

            if (publicKey) {
                if (keypair.publicKey.toString('hex') != publicKey) {
                    return res.json({success: false, error: "Please, provide valid secret key of your account"});
                }
            }

            var account = modules.accounts.getAccountByPublicKey(keypair.publicKey.toString('hex'));

            if (!account) {
                return res.json({success: false, error: "Account doesn't has balance"});
            }

            if (!account.publicKey) {
                return res.json({success: false, error: "Open account to make transaction"});
            }

            var transaction = {
                type: 6,
                amount: 0,
                recipientId: null,
                senderPublicKey: account.publicKey,
                timestamp: slots.getTime(),
                asset: {
                    username : username
                }
            };

            modules.transactions.sign(secret, transaction);

            if (account.secondSignature) {
                if (!secondSecret) {
                    return res.json({success: false, error: "Provide second secret key"});
                }

                modules.transactions.secondSign(secondSecret, transaction);
            }

            library.sequence.add(function (cb) {
                modules.transactions.processUnconfirmedTransaction(transaction, true, cb);
            }, function (err) {
                if (err) {
                    return res.json({success: false, error: err});
                }

                res.json({success: true, transaction: transaction});
            });
        });
    });

    router.get('/isFree', function(req, res, next){
        if (! req.query.username) {
            res.status(400).json({
                success: false,
                error: "Invalid request"
            });
            return;
        }

        self.isRegistered(req.query.username, function(err, registered){
            if (err !== null) return next(err);

            res.json({
                success: true,
                isFree: !registered
            });
        });
    });

    library.app.use('/api/usernames', router);
    library.app.use(function (err, req, res, next) {
        if (!err) return next();
        library.logger.error('/api/usernames', err);
        res.status(500).send({success: false, error: err.toString()});
    });
}



