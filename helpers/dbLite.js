var dblite = require('dblite');


module.exports.connect = function (connectString, cb) {
	var db = dblite(connectString);
	cb(null, db);
}