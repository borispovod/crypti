function callMethod(private, call, args, cb) {
	if (private.shared.indexOf(call) < 0) {
		return cb("This call not found in this module: " + call);
	}

	if (typeof private[call] !== 'function') {
		return cb("This call not found in this module, but shared, notify developers: " + call);
	}

	var callArgs = [args, cb];
	private[call].apply(null, callArgs);
}

module.exports = {
	callMethod: callMethod
};