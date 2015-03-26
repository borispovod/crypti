var underscore  =require('underscore');
var squel = require('squel');
var Router = require('../helpers/router.js');
var TYPES = require('../helpers/transaction.js').Types;

module.exports = Contacts;

var self, modules, library;

/**
 * Contacts module constructor
 * @param {function} cb Result callback
 * @param {{}} scope Library object
 * @constructor
 */
function Contacts(cb, scope) {
    self = this;
    library = scope;

    this._unconfirmed = [];
    attachApi();

    cb(null, this);
}

/**
 * OnBind event handler.
 * @param {{}} scope Application modules
 */
Contacts.prototype.onBind = function(scope){
    modules = scope;
};


/**
 * Add unconfirmed contact to module memory
 * @param {string} owner Owner address.
 * @param {string} target Target address.
 */
Contacts.prototype.addUnconfirmed = function(owner, target) {
    this._unconfirmed.push(owner + '|' + target);
};

/**
 * Remove stored unconfirmed contact.
 * @param {string} owner Owner address (who follow_
 * @param {string} target Target address (whom follow)
 */
Contacts.prototype.removeUnconfirmed = function(owner, target){
    var i = this._unconfirmed.indexOf(owner + '|' + target);
    if (i < 0) return;

    this._unconfirmed.splice(i, 1);
};

/**
 * Check whether unconfirmed contact exists by owner and target addresses.
 * @param {string} owner Owner address
 * @param {string} target Target address
 * @returns {boolean} True if exists
 */
Contacts.prototype.existsUnconfirmed = function(owner, target) {
    return this._unconfirmed.indexOf(owner + '|' + target) > -1;
};

/**
 * Contact SQL table fields
 * @type {{owner: (String|*|Function), target: (String|*|Function), transactionId: (String|*|Function)}}
 */
Contacts.prototype.contactFields = {
    owner : String,
    target : String,
    transactionId : String
};

/**
 * Get contacts by address.
 * @param {string} address Address
 * @param {function} cb Result callback
 */
Contacts.prototype.getContactsWithAddress = function(address, cb) {
    var query = squel.select()
        .from('contacts')
        .where('owner = ?', address);

    var param = query.toParam();

    library.dbLite.query(param.text, param.values, self.contactFields, cb);
};

/**
 * Check if contact already exists.
 * @param {string} owner  Owner address (who follow)
 * @param {string} target Target address (whom follow)
 * @param {function} cb result callback
 */
Contacts.prototype.contactExists = function(owner, target, cb) {
    var query = squel.select()
        .from('contacts')
        .field('count(owner)', 'count')
        .where('owner = ? AND target = ?', owner, target);

    var param = query.toParam();

    library.dbLite.query(param.text, param.values, [Number], function(err, result){
        if (err !== null) return cb(err);

        cb(null, result.length > 0 && result[0][0] === 1);
    });
};

/**
 * Add contact.
 * @param {string} owner Owner address (who follow)
 * @param {string} target Target address (whom follow)
 * @param {string} transactionId Transaction id
 * @param {function(Error|null)} cb Result callback
 */
Contacts.prototype.addContact = function(owner, target, transactionId, cb){
    var query = squel.insert()
        .into('contacts')
        .setFields({
            owner : owner,
            target : target,
            transactionId: transactionId
        });

    var param = query.toParam();


    library.dbLite.query(param.text, param.values, cb);
};

function attachApi() {
    var router = new Router();

    // Add contact
    router.post('/contacts', function(req, res, next){
        req.sanitize("body", {
            publicKey: "string!",
            target: "string!",
            secret: "string!"
        }, function(err, report, body){
            if (err) return next(err);
            if (! report.isValid()) return next(report.issues);

            var keypair = modules.accounts.getKeypair(body.publicKey);
            var account = modules.accounts.getAccountByPublicKey(keypair.publicKey);
            var target = body.target;

            if (! account) {
                return res.json({success:false, error: "Follower account not found"});
            }

            if (! modules.accounts.getAccount(target)) {
                return res.json({success:false, error: "Following account not found"});
            }

            if (account.address === target) {
                return next("Self following is not allowed.");
            }

            modules.contacts.contactExists(account.address, target, function(err, exists){
                if (err) return next(err);
                if (exists) return next("Contact already exists");

                var transaction = {
                    type : TYPES.CONTACT_ADD,
                    amount : 0,
                    senderPublicKey : account.publicKey,
                    asset : {
                        owner : account.address,
                        target : target
                    }
                };

                modules.transactions.sign(body.secret, transaction);

                // Add transaction
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
    });

    // List all contacts by publicKey
    router.get('/contacts/all', function(req, res, next){
        req.sanitize('query', {
            publicKey : 'string!'
        }, function(err, report, query){
            if (err) return next(err);
            if (! report.isValid) return res.json({success:false, error:report.issues});

            // Get current user address
            var keypair = modules.accounts.getKeypair(query.publicKey);
            var address = modules.accounts.getAddressByPublicKey(keypair.publicKey);

            self.getContactsWithAddress(address, function(err, contacts){
                if (err !== null) return next(err);

                // Filter data
                contacts = contacts.forEach(function(contact){
                    return underscore.pick(contact, 'owner', 'target');
                });

                res.json({success:true, items : contacts});
            });
        });
    });

    library.app.use('/api/contacts', router);
    library.app.use(function (err, req, res, next) {
        if (!err) return next();
        library.logger.error('/api/contacts', err);
        res.status(500).send({success: false, error: err.toString()});
    });
}
