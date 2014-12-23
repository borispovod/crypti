var fs = require('fs'),
	path = require('path');

function saveSecret(secret, cb) {
	var configFile = path.join(process.cwd(), 'config.json');
	fs.readFile(configFile, 'utf8', function (err, text) {
		if (err) {
			return cb(err);
		} else {
			var json = JSON.parse(text);
			json.forging.secret = secret;
			fs.writeFile(configFile, JSON.stringify(json, null, 4), function (err) {
				return cb(err);
			});
		}
	})
}

module.exports = {
	saveSecret: saveSecret
}