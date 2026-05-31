const router = require('express').Router();
const { authenticate, isAdmin, isPreventa, isComercial } = require('../middleware/auth.middleware');
const c = require('../controllers/proposal.controller');

router.use(authenticate);

router.get('/',                      c.list);
router.post('/',                     isComercial, c.create);
router.get('/:id',                   c.getOne);
router.patch('/:id/progress',        isPreventa, c.updateProgress);
router.patch('/:id/end-date',         isComercial, c.updateEndDate);
router.post('/:id/deliver',          isPreventa, c.deliver);
router.post('/:id/request-revision', isComercial, c.requestRevision);
router.post('/:id/accept-revision',  isPreventa, c.acceptRevision);
router.post('/:id/conclude',         isComercial, c.conclude);
router.patch('/:id/assign',          isAdmin, c.assign);

module.exports = router;
