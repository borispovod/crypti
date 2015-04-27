require('angular');

angular.module('webApp').controller('transactionInfoController', ["$scope", "$http", "transactionInfo", function ($scope, $http, transactionInfo) {

	console.log($scope.block);

    $scope.close = function () {
        transactionInfo.deactivate();
    }
}]);