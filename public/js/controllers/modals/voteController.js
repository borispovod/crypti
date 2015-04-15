require('angular');
var crypti = require('crypti-js');

angular.module('webApp').controller('voteController', ["$scope", "voteModal", "$http", "userService", "$timeout", 'peerFactory', "transactionService",
    function ($scope, voteModal, $http, userService, $timeout, peerFactory, transactionService) {
        $scope.voting = false;
        $scope.fromServer = '';
        $scope.secondPassphrase = userService.secondPassphrase;
		$scope.totalBalance = userService.balance || 0;

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

            var voteTransaction;

            if ($scope.secondPassphrase) {
                voteTransaction = crypti.vote.createVote($scope.secretPhrase, $scope.voteList, $scope.secondPhrase);
            }
            else {
                voteTransaction = crypti.vote.createVote($scope.secretPhrase, $scope.voteList);
            }

            var checkBeforSending = transactionService.checkTransaction(voteTransaction, $scope.secretPhrase);

            if (checkBeforSending.err) {
                $scope.fromServer = checkBeforSending.message;
                return;
            };

            $scope.voting = !$scope.voting;
            $http.post(peerFactory.getUrl() + "/peer/transactions", {transaction: voteTransaction}, transactionService.createHeaders()).then(function (resp) {
                $scope.voting = !$scope.voting;
                if (!resp.data.success) {
                    $scope.fromServer = resp.data.message;
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