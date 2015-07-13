function callMethod(shared, call, args, cb) {
	if (shared.indexOf(call) < 0) {
		return cb("This call not found in this module: " + call);
	}

	var callArgs = [args, cb];
	shared[call].apply(null, callArgs);
}

module.exports = {
	callMethod: callMethod
};