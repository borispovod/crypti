var nl = require('nodeload');
var loadtest = nl.run({
	host: 'localhost',
	port: 7040,
	numUsers: 200,
	targetRps: 200,
	reportInterval: 2,
	timeLimit: Infinity,
	requestGenerator: function(client) {
		var request = client.request('GET', "/api/blocks/?limit=80&offset=10000&orderBy=height:desc");
		request.end();
		return request;
	}
});
loadtest.on('end', function() { console.log('Load test done.'); });