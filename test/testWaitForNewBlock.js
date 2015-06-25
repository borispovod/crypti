var variables = require('./variables.js');

variables.onNewBlock(function (err, height) {
	console.log(err, height);
});