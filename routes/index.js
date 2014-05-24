var account = require('./account.js'),
    addresses = require("./addresses.js");

module.exports = function (app) {
    account(app);
    addresses(app);
}
