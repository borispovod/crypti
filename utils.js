module.exports = {
    getEpochTime: function (time) {
        var d = new Date();
        d.setMonth(4);
        d.setDate(2);
        d.setHours(0, 0, 0, 0);
        d.setFullYear(2014);
        var t = d.getTime();
        return parseInt((time - t) / 1000);
    },

    epochTime : function () {
        var d = new Date();
        d.setMonth(4);
        d.setDate(2);
        d.setHours(0, 0, 0, 0);
        d.setFullYear(2014);
        var t = parseInt(d.getTime() / 1000);

        return t;
    }

}