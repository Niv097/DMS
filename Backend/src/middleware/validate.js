export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.issues[0]?.message || 'Invalid request payload.'
    });
  }

  req.body = result.data;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.issues[0]?.message || 'Invalid request parameters.'
    });
  }

  req.params = result.data;
  next();
};
