module.exports = function (zscheme) {
	return function(req, res, next) {
		req.sanitize = sanitize;

		function sanitize(value, scheme, callback) {
			return zscheme.validate(value, scheme, function (err, valid) {
				return callback(err, {
					isValid: valid,
					issues: err
				}, value);
			})
		}

		next();
	};
}