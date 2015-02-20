require('angular');

angular.module('webApp').service('blockService', function () {
    this.lastBlockId = null;
});