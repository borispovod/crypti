webApp.controller('blockchainController', ['$scope', '$rootScope', '$http', "userService", "$interval", 'blockService', 'blockModal', function($rootScope, $scope, $http, userService, $interval, blockService, blockModal) {
    $scope.address = userService.address;
    $scope.getBlocks = function () {
        var params = {};

        if (blockService.lastBlockId) {
            params.blockId = blockService.lastBlockId;
        }

        $http.get("/api/lastBlock", { params: params })
            .then(function (resp) {
                $scope.blockchain = $scope.blockchain.concat(resp.data.blocks);
            });
    }

    $scope.getFirstBlocks = function () {
        $http.get("/api/getLastBlocks")
            .then(function (resp) {
                $scope.blockchain = resp.data.blocks;
                blockService.lastBlockId = resp.data.blocks[resp.data.blocks.length - 1].id;
            });
    }

    $scope.blocksInterval = $interval(function () {
        $scope.getBlocks();
    }, 1000 * 60);

    $scope.$on('$destroy', function() {
        $interval.cancel($scope.blocksInterval);
        $scope.blocksInterval = null;
    });

    $scope.showBlock = function (block) {
        $scope.modal = blockModal.activate({ block : block });
    }

    $scope.getFirstBlocks();
}]);