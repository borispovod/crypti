require('angular');

angular.module('webApp').controller('votedDelegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$filter", "ngTableParams", "delegateService", "voteModal",
    function ($rootScope, $scope, $http, userService, $interval, $filter, ngTableParams, delegateService, voteModal) {

        $scope.allVotes = 100 * 1000 * 1000;

        $scope.address = userService.address;


        $scope.getApproval = function (vote) {
            return (vote / $scope.allVotes ) * 100;
        };

        $scope.voteList = {
            list: [],
            inList: function (publicKey) {
                return this.list.indexOf('-' + publicKey) != -1;
            },
            vote: function (publicKey) {
                if (this.inList(publicKey)) {
                    this.list.splice('-' + this.list.indexOf(publicKey), 1);
                }
                else {
                    this.list.push('-' + publicKey);
                }
            }
        };

        $scope.vote = function (publicKey) {
            $scope.voteModal = voteModal.activate({
                totalBalance: $scope.unconfirmedBalance,
                voteList: $scope.voteList.list,
                destroy: function () {
                    $scope.voteList.list = [];
                    $scope.unconfirmedTransactions.getList();
                }
            });
        };

        $scope.balance = userService._unconfirmedBalance;

        //Unconfirmed transactions
        $scope.unconfirmedTransactions = {
            list: [],
            getList: function () {
                $http.get("/api/transactions/unconfirmed/", {params: {senderPublicKey: userService.publicKey}})
                    .then(function (response) {
                        $scope.unconfirmedTransactions.list = [];
                        response.data.transactions.forEach(function (transaction) {
                            $scope.unconfirmedTransactions.list = $scope.unconfirmedTransactions.list.concat(transaction.asset.votes);
                        });
                    });

            },
            inList: function (publicKey) {
                return this.list.indexOf('-' + publicKey) != -1;
            }
        };
        $scope.unconfirmedTransactions.getList();
        //end Unconfirmed transactions


        //My deletates
        $scope.tableMyDelegates = new ngTableParams({
            page: 1,            // show first page
            count: 5,
            sorting: {
                rate: 'asc'     // initial sorting
            }
        }, {
            counts: [5, 10, 25],
            total: 0,
            getData: function ($defer, params) {
                delegateService.getMyDelegates($defer, params, $scope.filter);
            }
        });

        $scope.tableMyDelegates.settings().$scope = $scope;

        $scope.$watch("filter.$", function () {
            $scope.tableMyDelegates.reload();
        });

        $scope.updateMyDelegates = function () {
            $scope.tableMyDelegates.reload();
        };
        //end My delegates


        $scope.updateView = $interval(function () {

            delegateService.cachedStundby.time = delegateService.cachedStundby.time - 20000;

            $scope.updateMyDelegates();
            $scope.unconfirmedTransactions.getList();

        }, 1000 * 10);

    }]);