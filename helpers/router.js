/**
 * @title Router
 * @overview Router stub
 * @returns {*}
 */
module.exports = function () {
	var router = require('express').Router();

	router.use(function (req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});

	return router;
};