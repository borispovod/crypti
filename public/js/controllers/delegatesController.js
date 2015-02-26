require('angular');

angular.module('webApp').controller('delegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$filter", "ngTableParams", "delegateService", "voteModal",
    function ($rootScope, $scope, $http, userService, $interval, $filter, ngTableParams, delegateService, voteModal) {

        $scope.allVotes = 100 * 1000 * 1000;

        $scope.address = userService.address;

        $scope.getApproval = function (vote) {
            return (vote / $scope.allVotes ) * 100;
        };

        $scope.voteList = {
            list: [],
            inList: function (publicKey) {
                return this.list.indexOf('+' + publicKey) != -1;
            },
            vote: function (publicKey) {
                if (this.inList(publicKey)) {
                    this.list.splice('+' + this.list.indexOf(publicKey), 1);
                }
                else {
                    this.list.push('+' + publicKey);
                }
            }
        };

        $scope.vote = function (publicKey) {
            $scope.voteModal = voteModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                voteList: $scope.voteList.list,
                destroy: function () {
                    $scope.voteList = [];
                }
            });
        };

        $scope.balance = userService._unconfirmedBalance;

        //Top deletates
        $scope.tableTopDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 101,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [], // hide page counts control
            getData: function ($defer, params) {
                delegateService.getTopList($defer, params, $scope.filter);
            }
        });

        $scope.tableTopDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableTopDelegates.reload();
        });

        $scope.updateTop = $interval(function () {
            if (new Date() - delegateService.cachedTOP.time >= 1000 * 10) {
                $scope.tableTopDelegates.reload();
            }
        }, 1000 * 1);
        //end Top delegates

        //Standby deletates
        $scope.tableStandbyDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 100,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [], // hide page counts control
            getData: function ($defer, params) {
                delegateService.getStandbyList($defer, params, $scope.filter);
            }
        });

        $scope.tableStandbyDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableStandbyDelegates.reload();
        });

        $scope.updateStandby = $interval(function () {
            if (new Date() - delegateService.cachedStundby.time >= 1000 * 10) {
                $scope.tableStandbyDelegates.reload();
            }
        }, 1000 * 1);
        //end Standby delegates

    }]);