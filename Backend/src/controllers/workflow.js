import workflowService from '../services/workflowService.js';
import logger from '../utils/logger.js';

export const recommend = async (req, res) => {
  const { noteId, comment, isFinal = false } = req.body;
  try {
    const result = await workflowService.recommend(noteId, req.user.id, isFinal, comment);
    res.json(result);
  } catch (err) {
    logger.error('Error in workflow recommendation', { error: err.message, noteId, userId: req.user.id });
    res.status(400).json({ message: err.message });
  }
};

export const approve = async (req, res) => {
  const { noteId, comment } = req.body;
  try {
    const result = await workflowService.recommend(noteId, req.user.id, true, comment);
    res.json(result);
  } catch (err) {
    logger.error('Error in workflow final approval', { error: err.message, noteId, userId: req.user.id });
    res.status(400).json({ message: err.message });
  }
};

export const returnForChanges = async (req, res) => {
  const { noteId, comment, returnToStage = 0 } = req.body;
  try {
    const result = await workflowService.returnForChanges(noteId, req.user.id, returnToStage, comment);
    res.json(result);
  } catch (err) {
    logger.error('Error in workflow return action', { error: err.message, noteId, userId: req.user.id });
    res.status(400).json({ message: err.message });
  }
};

export const refer = async (req, res) => {
  // Implement temporal refer logic
  res.json({ message: 'Refer logic initialized' });
};
