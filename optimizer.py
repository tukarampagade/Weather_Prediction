"""
optimizer.py
------------
From-scratch implementations of two optimizers used to update the
Neural Network's parameters:

1. SGD (Stochastic Gradient Descent)
       W = W - alpha * dW

2. Adam (Adaptive Moment Estimation)
       m_t = beta1 * m_(t-1) + (1 - beta1) * g_t
       v_t = beta2 * v_(t-1) + (1 - beta2) * g_t^2
       m_hat = m_t / (1 - beta1^t)
       v_hat = v_t / (1 - beta2^t)
       theta_(t+1) = theta_t - (alpha / (sqrt(v_hat) + eps)) * m_hat

No external ML framework is used; everything is pure NumPy.
"""

import numpy as np


class SGD:
    """Plain Stochastic Gradient Descent optimizer."""

    def __init__(self, params, learning_rate=0.01):
        self.learning_rate = learning_rate

    def update(self, params, grads):
        """
        params : dict of current parameters {name: ndarray}
        grads  : dict of gradients {name: ndarray}, same keys as params

        Returns the updated params dict.
        """
        updated = {}
        for key in params:
            updated[key] = params[key] - self.learning_rate * grads[key]
        return updated


class Adam:
    """Adam optimizer (Adaptive Moment Estimation) implemented from scratch."""

    def __init__(self, params, learning_rate=0.001, beta1=0.9, beta2=0.999, epsilon=1e-8):
        self.learning_rate = learning_rate
        self.beta1 = beta1
        self.beta2 = beta2
        self.epsilon = epsilon
        self.t = 0  # timestep

        # First and second moment estimates, initialized to zero for every parameter
        self.m = {key: np.zeros_like(value) for key, value in params.items()}
        self.v = {key: np.zeros_like(value) for key, value in params.items()}

    def update(self, params, grads):
        """
        Performs one Adam update step across all parameters.

        params : dict of current parameters {name: ndarray}
        grads  : dict of gradients {name: ndarray}, same keys as params

        Returns the updated params dict.
        """
        self.t += 1
        updated = {}

        for key in params:
            g = grads[key]

            # Update biased first moment estimate
            self.m[key] = self.beta1 * self.m[key] + (1 - self.beta1) * g

            # Update biased second raw moment estimate
            self.v[key] = self.beta2 * self.v[key] + (1 - self.beta2) * (g ** 2)

            # Bias-corrected moment estimates
            m_hat = self.m[key] / (1 - self.beta1 ** self.t)
            v_hat = self.v[key] / (1 - self.beta2 ** self.t)

            # Parameter update
            updated[key] = params[key] - (self.learning_rate / (np.sqrt(v_hat) + self.epsilon)) * m_hat

        return updated
