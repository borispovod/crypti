require('angular');

angular.module('webApp').controller('blockInfoController', ["$scope", "$http", "blockInfo", function ($scope, $http, blockInfo) {


	console.log($scope.block);

    $scope.close = function () {
        blockInfo.deactivate();
    }
}]);