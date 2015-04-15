require('angular');

angular.module('webApp').factory('peerFactory', ['$http', 'transactionService', '$interval', function ($http, transactionService, $interval) {

    var factory = {
        editing: false,
        peer: null,
        peerList: [
            {
                ip: "104.155.57.21",
                port: "8040"
            },
            {
                ip: "130.211.104.33",
                port: "7040"
            },
            {
                ip: "130.211.72.188",
                port: "5040"
            },
            {
                ip: "130.211.72.188",
                port: "7040"
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