var crypto = require('crypto'),
	bignum = require('bignum');

function getBytes(script) {
	// need to fix
	var inputBuffer = new Buffer(script.parameters, 'hex');
	var codeBuffer = new Buffer(script.code, 'hex');
	var name = new Buffer(script, "utf8");
	var description = new Buffer(script.description? description : "", "utf8");
	var objBuffer = Buffer.concat([inputBuffer, codeBuffer, name, description]);

	return objBuffer;
}

function getInputBytes(input) {
	var inputBuffer = new Buffer(input, 'hex');
	var scriptId = new Buffer(scriptId, 'utf8');
	return Buffer.concat([inputBuffer, scriptId]);
}

module.exports = {
	getBytes : getBytes,
	getInputBytes : getInputBytes
}
