module.exports = function(req, res, next) {
   if (req.isAuthenticated()) {
        return next();
    }
    else{
    	return next();
        //return res.redirect('/login');
    }
};