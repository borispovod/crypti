require('angular');

angular.module('webApp').controller('voteController', ["$scope", "voteModal", "$http", "userService", "$timeout", function ($scope, voteModal, $http, userService, $timeout) {
    $scope.voting = false;
    $scope.fromServer = '';
    $scope.passmode = false;
    $scope.passcheck = function () {
        $scope.passmode = !$scope.passmode;
        $scope.pass = '';
    }
    $scope.secondPassphrase = userService.secondPassphrase;

    Number.prototype.roundTo = function (digitsCount) {
        var digitsCount = typeof digitsCount !== 'undefined' ? digitsCount : 2;
        var s = String(this);
        if (s.indexOf('e') < 0) {
            var e = s.indexOf('.');
            if (e == -1) return this;
            var c = s.length - e - 1;
            if (c < digitsCount) digitsCount = c;
            var e1 = e + 1 + digitsCount;
            var d = Number(s.substr(0, e) + s.substr(e + 1, digitsCount));
            if (s[e1] > 4) d += 1;
            d /= Math.pow(10, digitsCount);
            return d.valueOf();
        } else {
            return this.toFixed(digitsCount);
        }
    }

    Math.roundTo = function (number, digitsCount) {
        number = Number(number);
        return number.roundTo(digitsCount).valueOf();
    }

    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }
        voteModal.deactivate();
    }


    $scope.vote = function () {

        var data = {
            secret: $scope.secretPhrase,
            delegates: Object.keys($scope.voteList).map(function (key) {
                return ($scope.adding ? '+' : '-') + key;
            }),
            publicKey: userService.publicKey
        };

        if ($scope.secondPassphrase) {
            data.secondSecret = $scope.secondPhrase;
        }
        $scope.voting = !$scope.voting;
        $http.put("/api/accounts/delegates", data).then(function (resp) {
            $scope.voting = !$scope.voting;
            if (resp.data.error) {
                $scope.fromServer = resp.data.error;
            }
            else {
                if ($scope.destroy) {
                    $scope.destroy();
                }
                voteModal.deactivate();
            }
        });
    }
}]);