require('angular');

angular.module('webApp').factory('peerFactory', ['$http', 'transactionService', '$interval', function ($http, transactionService, $interval) {

    var factory = {
        editing: false,
        peer: null,
        peerList: [
			{
				"ip": "104.155.2.92",
				"port": 8040
			},
			{
				"ip": "130.211.95.57",
				"port": 8040
			},
			{
				"ip": "130.211.111.230",
				"port": 8040
			},
			{
				"ip": "130.211.54.79",
				"port": 8040
			}
        ],
        checkPeer: function (url, cb, timeout) {
            $http.get(url + "/peer/list", transactionService.createHeaders(timeout))
                .then(function (resp) {
                    cb(resp);
                }, function (err) {
                    cb(err);
                });
        },
        setPeer: function (ip, port) {
            this.peer = {
                ip: ip,
                port: port
            };
        },
        getUrl: function () {
            return "http://" + this.peer.ip + ":" + this.peer.port + "";
        }
    }

    return factory;

}]);