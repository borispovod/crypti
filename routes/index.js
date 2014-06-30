var account = require('./account.js'),
    addresses = require("./addresses.js"),
    transactions = require("./transactions.js");

module.exports = function (app) {
    account(app);
    addresses(app);
    transactions(app);
}
