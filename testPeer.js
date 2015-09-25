var crypti = require('./test/cryptijs');
var request = require('request');


var transaction = crypti.vote.createVote(
	"F3DP835EBuZMAhiuYn2AzhJh1lz8glLolghCMD4X8lRh5v2GlcBWws7plIDUuPjf3GUTOnyYEfXQx7cH",
	[
		"+cd03fbddcaaa2703c251656d5ccdd99f5635b1e0653c0636b951a3a3db21dad4",
		//"+f84d1fe0a6b6234c155f0f420786f4c575015317c1f41e9cb2b55dcd1e3aee68",
		//"+39b0170e388c7399d4b6a1331083b61db9f4b199ff1a0061315f361456bdc22c",
		//"+b5a4e4b5a2c391adbf7808bbf679035f27db78f66092af4d451207d250fb3e0b",
		//"+5a68e2d30f8ec6f3c65a13670de43992b220bf907d0d0b749d69ea4cfac51372"
	]
);

request({
	method: "POST",
	url: "http://localhost:4060/peer/transactions",
	json: true,
	body: {
		transaction: transaction
	}
}, function (err, resp, body) {
	console.log(err, resp, body);
})