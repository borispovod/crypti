var instance;
var lastBlock;
function getInstance() {
    return instance;
}

function getLastBlock() {
    return lastBlock;
}

function setLastBlock(block) {
    lastBlock = block;
}

function setLastBlock(previousBlock, block) {
    // TODO переписать
    if (! lastBlock.compareAndSet(previousBlock, block)) {
        throw new IllegalStateException("Last block is no longer previous block");
    }
}

function getBlock(blockId) {
    // TODO переписать
    return BlockDb.findBlock(blockId);
}

function hasBlock(blockId) {
    // TODO переписать
    return BlockDb.hasBlock(blockId);
}
// TODO переписать
function getBlockCount() {
    try (Connection con = Db.getConnection(); PreparedStatement pstmt = con.prepareStatement("SELECT COUNT(*) FROM block")) {
        ResultSet rs = pstmt.executeQuery();
        rs.next();
        return rs.getInt(1);
    } catch (SQLException e) {
        throw new RuntimeException(e.toString(), e);
    }
}
// TODO переписать
function getAllBlocks() {
    Connection con = null;
    try {
        con = Db.getConnection();
        PreparedStatement pstmt = con.prepareStatement("SELECT * FROM block ORDER BY db_id ASC");
        return getBlocks(con, pstmt);
    } catch (SQLException e) {
        DbUtils.close(con);
        throw new RuntimeException(e.toString(), e);
    }
}
// TODO переписать. Account
function getBlocks(account, timestamp) {
    Connection con = null;
    try {
        con = Db.getConnection();
        PreparedStatement pstmt = con.prepareStatement("SELECT * FROM block WHERE timestamp >= ? AND generator_id = ? ORDER BY db_id ASC");
        pstmt.setInt(1, timestamp);
        pstmt.setLong(2, account.getId());
        return getBlocks(con, pstmt);
    } catch (SQLException e) {
        DbUtils.close(con);
        throw new RuntimeException(e.toString(), e);
    }
}
// TODO переписать
function getBlocks(Connection con, PreparedStatement pstmt) {
    return new DbIterator<>(con, pstmt, new DbIterator.ResultSetReader<BlockImpl>() {
        @Override
        public BlockImpl get(Connection con, ResultSet rs) throws NxtException.ValidationException {
            return BlockDb.loadBlock(con, rs);
        }
    });
}
// TODO переписать
function getBlockIdsAfter(Long blockId, int limit) {
    if (limit > 1440) {
        throw new IllegalArgumentException("Can't get more than 1440 blocks at a time");
    }
    try (Connection con = Db.getConnection();
    PreparedStatement pstmt1 = con.prepareStatement("SELECT db_id FROM block WHERE id = ?");
    PreparedStatement pstmt2 = con.prepareStatement("SELECT id FROM block WHERE db_id > ? ORDER BY db_id ASC LIMIT ?")) {
        pstmt1.setLong(1, blockId);
        ResultSet rs = pstmt1.executeQuery();
        if (! rs.next()) {
            rs.close();
            return Collections.emptyList();
        }
        List<Long> result = new ArrayList<>();
        int dbId = rs.getInt("db_id");
        pstmt2.setInt(1, dbId);
        pstmt2.setInt(2, limit);
        rs = pstmt2.executeQuery();
        while (rs.next()) {
            result.add(rs.getLong("id"));
        }
        rs.close();
        return result;
    } catch (SQLException e) {
        throw new RuntimeException(e.toString(), e);
    }
}
// TODO переписать
function getBlocksAfter(blockId, limit) {
    if (limit > 1440) {
        throw new IllegalArgumentException("Can't get more than 1440 blocks at a time");
    }
    try (Connection con = Db.getConnection();
    PreparedStatement pstmt = con.prepareStatement("SELECT * FROM block WHERE db_id > (SELECT db_id FROM block WHERE id = ?) ORDER BY db_id ASC LIMIT ?")) {
        List<BlockImpl> result = new ArrayList<>();
        pstmt.setLong(1, blockId);
        pstmt.setInt(2, limit);
        ResultSet rs = pstmt.executeQuery();
        while (rs.next()) {
            result.add(BlockDb.loadBlock(con, rs));
        }
        rs.close();
        return result;
    } catch (NxtException.ValidationException|SQLException e) {
        throw new RuntimeException(e.toString(), e);
    }
}
// TODO переписать
function getBlockIdAtHeight(height) {
    Block block = lastBlock.get();
    if (height > block.getHeight()) {
        throw new IllegalArgumentException("Invalid height " + height + ", current blockchain is at " + block.getHeight());
    }
    if (height == block.getHeight()) {
        return block.getId();
    }
    return BlockDb.findBlockIdAtHeight(height);
}
// TODO переписать
function getBlocksFromHeight(height) {
    if (height < 0 || lastBlock.get().getHeight() - height > 1440) {
        throw new IllegalArgumentException("Can't go back more than 1440 blocks");
    }
    try (Connection con = Db.getConnection();
    PreparedStatement pstmt = con.prepareStatement("SELECT * FROM block WHERE height >= ? ORDER BY height ASC")) {
        pstmt.setInt(1, height);
        ResultSet rs = pstmt.executeQuery();
        List<BlockImpl> result = new ArrayList<>();
        while (rs.next()) {
            result.add(BlockDb.loadBlock(con, rs));
        }
        return result;
    } catch (SQLException|NxtException.ValidationException e) {
        throw new RuntimeException(e.toString(), e);
    }
}
// TODO переписать
function getTransaction(transactionId) {
    return TransactionDb.findTransaction(transactionId);
}
// TODO переписать
function getTransaction(String hash) {
    return TransactionDb.findTransaction(hash);
}
// TODO переписать
function hasTransaction(transactionId) {
    return TransactionDb.hasTransaction(transactionId);
}
// TODO переписать
function getTransactionCount() {
    try (Connection con = Db.getConnection(); PreparedStatement pstmt = con.prepareStatement("SELECT COUNT(*) FROM transaction")) {
        ResultSet rs = pstmt.executeQuery();
        rs.next();
        return rs.getInt(1);
    } catch (SQLException e) {
        throw new RuntimeException(e.toString(), e);
    }
}

function getAllTransactions() {
    Connection con = null;
    try {
        con = Db.getConnection();
        PreparedStatement pstmt = con.prepareStatement("SELECT * FROM transaction ORDER BY db_id ASC");
        return getTransactions(con, pstmt);
    } catch (SQLException e) {
        DbUtils.close(con);
        throw new RuntimeException(e.toString(), e);
    }
}

function getTransactions(account, type, subtype, timestamp) {
    return getTransactions(account, type, subtype, timestamp, Boolean.TRUE);
}
// TODO переписать
function getTransactions(account, type, subtype, timestamp, orderAscending) {
    Connection con = null;
    try {
        StringBuilder buf = new StringBuilder();
        if (orderAscending != null) {
            buf.append("SELECT * FROM (");
        }
        buf.append("SELECT * FROM transaction WHERE recipient_id = ? ");
        if (timestamp > 0) {
            buf.append("AND timestamp >= ? ");
        }
        if (type >= 0) {
            buf.append("AND type = ? ");
            if (subtype >= 0) {
                buf.append("AND subtype = ? ");
            }
        }
        buf.append("UNION SELECT * FROM transaction WHERE sender_id = ? ");
        if (timestamp > 0) {
            buf.append("AND timestamp >= ? ");
        }
        if (type >= 0) {
            buf.append("AND type = ? ");
            if (subtype >= 0) {
                buf.append("AND subtype = ? ");
            }
        }
        if (Boolean.TRUE.equals(orderAscending)) {
            buf.append(") ORDER BY timestamp ASC");
        } else if (Boolean.FALSE.equals(orderAscending)) {
            buf.append(") ORDER BY timestamp DESC");
        }
        con = Db.getConnection();
        PreparedStatement pstmt;
        int i = 0;
        pstmt = con.prepareStatement(buf.toString());
        pstmt.setLong(++i, account.getId());
        if (timestamp > 0) {
            pstmt.setInt(++i, timestamp);
        }
        if (type >= 0) {
            pstmt.setByte(++i, type);
            if (subtype >= 0) {
                pstmt.setByte(++i, subtype);
            }
        }
        pstmt.setLong(++i, account.getId());
        if (timestamp > 0) {
            pstmt.setInt(++i, timestamp);
        }
        if (type >= 0) {
            pstmt.setByte(++i, type);
            if (subtype >= 0) {
                pstmt.setByte(++i, subtype);
            }
        }
        return getTransactions(con, pstmt);
    } catch (SQLException e) {
        DbUtils.close(con);
        throw new RuntimeException(e.toString(), e);
    }
}

function getTransactions(con, pstmt) {
    return new DbIterator<>(con, pstmt, new DbIterator.ResultSetReader<TransactionImpl>() {
        @Override
        public TransactionImpl get(Connection con, ResultSet rs) throws NxtException.ValidationException {
            return TransactionDb.loadTransaction(con, rs);
        }
    });
}