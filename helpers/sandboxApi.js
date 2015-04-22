function applySandboxApi(message, sandboxApi, callback) {
	var data = message.data || [];
	data.push(callback);
	var method = (message.method || '').replace(/Sync$/, '');

	if (sandboxApi[method]) {
		sandboxApi[method].apply(this, data);
		return true;
	} else {
		return false;
	}
}

module.exports = {
	applySandboxApi : applySandboxApi
}