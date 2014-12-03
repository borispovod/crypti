var sqlite3 = require('sqlite3');
var db = new sqlite3.Database('./blockchain.db');
db.all(
	"SELECT * FROM blocks", function (err, rows) {
		console.log(err, rows && rows.length);
		db.close();

		var name = require.resolve('sqlite3');
		delete require.cache[name];
	});

process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', function (text) {
	if (text === 'quit\n') {
		done();
	}
});

function done() {
	process.exit();
}
