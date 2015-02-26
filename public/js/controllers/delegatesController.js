require('angular');

angular.module('webApp').controller('delegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$filter", "ngTableParams", "delegateService",
    function ($rootScope, $scope, $http, userService, $interval, $filter, ngTableParams, delegateService) {

        $scope.address = userService.address;

        $scope.voteList = {
            list: [],
            inList: function(publicKey){
                return this.list.indexOf(publicKey)!=-1;
            },
            vote: function(publicKey){
                if (this.inList(publicKey)){
                    this.list.splice(this.list.indexOf(publicKey), 1);
                }
                else {
                    this.list.push(publicKey);
                }
            }
        };

        $scope.vote = function (publicKey) {

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

    }]);