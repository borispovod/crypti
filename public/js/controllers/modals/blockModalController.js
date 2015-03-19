require('angular');

angular.module('webApp').controller('blockModalController', ["$scope", "$http", "blockModal", "peerFactory", function ($scope, $http, blockModal, peerFactory) {
	$scope.loading = true;

	$scope.getTransactionsOfBlock = function (blockId) {
		$http.get(peerFactory.getUrl() + "/api/transactions/", { params : { blockId : blockId }})
			.then(function (resp) {
				$scope.transactions = resp.data.transactions;
				$scope.loading = false;
			});
	};

	$scope.getTransactionsOfBlock($scope.block.id);

    $scope.close = function () {
        blockModal.deactivate();
    }
}]);