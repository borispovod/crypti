require('angular');

angular.module('webApp').service('blockService', function ($http) {

    var blocks = {
        lastBlockId: null,
        getBlocks: function ($defer, params, filter, cb) {
            $http.get("/api/blocks/", {params: {orderBy: "height:desc", limit: params.count(), offset: (params.page() - 1) * params.count()}})
                .then(function (response) {
                    $http.get("/api/blocks/", {params: {orderBy: "height:desc", limit: 1, offset: 0}})
                        .then(function (res) {
                            params.total(res.data.blocks[0].height);
                            $defer.resolve(response.data.blocks);
                            blocks.lastBlockId = response.data.blocks[response.data.blocks.length - 1].id;
							cb();
                        });
                });
        }
    }

    return blocks;
});