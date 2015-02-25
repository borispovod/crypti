/**
 * Convert script object data to buffer.
 * @param {{}} script
 * @returns {Buffer}
 */
function getBytes(script) {
	// need to fix
	var inputBuffer = new Buffer(script.parameters, 'hex');
	var codeBuffer = new Buffer(script.code, 'hex');
	var name = new Buffer(script.name, 'utf8');
	var description = new Buffer(script.description || '', 'utf8');

	return Buffer.concat([inputBuffer, codeBuffer, name, description]);
}

/**
 * Convert input object to buffer.
 * @param {{data:string,scriptId:string}} input
 * @returns {Buffer}
 */
function getInputBytes(input) {
	var inputBuffer = new Buffer(input.data, 'hex');
	var scriptId = new Buffer(input.scriptId, 'utf8');

	return Buffer.concat([inputBuffer, scriptId]);
}

module.exports = {
	getBytes : getBytes,
	getInputBytes : getInputBytes
}
