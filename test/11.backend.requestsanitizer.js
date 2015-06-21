var node = require('./variables.js');
var sanitizer = require('../helpers/request-sanitizer.js');

describe.skip("Request sanitizer", function () {
	it("String instead int. Should return not ok", function (done) {
		var report = sanitizer.validate({i: null}, {object:true, properties: {"i" : "int!"}}, function (err, report, output) {
			node.expect(err).to.be.equal(null);
			done();
		});
		//console.log(report);
	});

	it("Float instead int. Should return not ok", function () {
		//var report =
	});

	it("Object instead int. Should return not ok", function () {
	});

	it("Boolean instead int. Should return not ok", function () {
	});

	it("Array instead int. Should return not ok", function () {
	});

	it("Null instead int. Should return no ok", function () {
	});
});