require('angular');

angular.module('webApp').factory('peerFactory',[function () {
	var peer = {
		ip : "130.211.72.188",
		port : "5040"
	};

	var url = "http://" + peer.ip + ":" + peer.port + "";

	return {
		peer : peer,
		url : url
	}
}]);