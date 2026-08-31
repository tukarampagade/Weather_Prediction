"""
neural_network.py
------------------
A 3-layer feedforward Neural Network implemented from scratch using pure NumPy.

Architecture:
    Input  -> Hidden Layer 1 (16 neurons, ReLU)
           -> Hidden Layer 2 (8 neurons, ReLU)
           -> Output Layer  (1 neuron, Sigmoid)   [Binary Classification]

No TensorFlow / Keras / PyTorch is used anywhere in this file.
All forward propagation, backpropagation, and weight updates are implemented
using explicit matrix calculus with NumPy vectorization.
"""

import os
import numpy as np

from optimizer import SGD, Adam


class NeuralNetwork:
    """
    A from-scratch 3-layer feedforward neural network for binary classification.

    Parameters
    ----------
    input_size : int
        Number of input features (inferred dynamically from the dataset).
    hidden1_size : int
        Number of neurons in the first hidden layer. Default 16.
    hidden2_size : int
        Number of neurons in the second hidden layer. Default 8.
    output_size : int
        Number of output neurons. Default 1 (binary classification).
    optimizer : str
        Either "sgd" or "adam". Default "adam".
    learning_rate : float
        Learning rate for the optimizer.
    seed : int
        Random seed for reproducible weight initialization.
    """

    def __init__(self, input_size, hidden1_size=16, hidden2_size=8,
                 output_size=1, optimizer="adam", learning_rate=0.01, seed=42):
        np.random.seed(seed)

        self.input_size = input_size
        self.hidden1_size = hidden1_size
        self.hidden2_size = hidden2_size
        self.output_size = output_size

        # ---- He Initialization for ReLU layers (W1, W2) ----
        # He init: W ~ N(0, sqrt(2 / fan_in))
        W1 = np.random.randn(input_size, hidden1_size) * np.sqrt(2.0 / input_size)
        b1 = np.zeros((1, hidden1_size))

        W2 = np.random.randn(hidden1_size, hidden2_size) * np.sqrt(2.0 / hidden1_size)
        b2 = np.zeros((1, hidden2_size))

        # ---- Xavier (Glorot) Initialization for the Sigmoid output layer ----
        # Xavier init: W ~ N(0, sqrt(1 / fan_in))
        W3 = np.random.randn(hidden2_size, output_size) * np.sqrt(1.0 / hidden2_size)
        b3 = np.zeros((1, output_size))

        self.weights = {"W1": W1, "W2": W2, "W3": W3}
        self.biases = {"b1": b1, "b2": b2, "b3": b3}

        # Cache for intermediate values used during backprop
        self.cache = {}

        # Optimizer selection
        params = {**self.weights, **self.biases}
        if optimizer.lower() == "sgd":
            self.optimizer = SGD(params, learning_rate=learning_rate)
        elif optimizer.lower() == "adam":
            self.optimizer = Adam(params, learning_rate=learning_rate)
        else:
            raise ValueError("optimizer must be either 'sgd' or 'adam'")

        self.optimizer_name = optimizer.lower()
        self.history = {"loss": [], "accuracy": []}

    # ------------------------------------------------------------------
    # Activation functions
    # ------------------------------------------------------------------
    @staticmethod
    def relu(Z):
        return np.maximum(0, Z)

    @staticmethod
    def relu_derivative(Z):
        return (Z > 0).astype(float)

    @staticmethod
    def sigmoid(Z):
        # Clip Z to avoid overflow in exp() -> numerical stability
        Z_clipped = np.clip(Z, -500, 500)
        return 1.0 / (1.0 + np.exp(-Z_clipped))

    # ------------------------------------------------------------------
    # Forward Propagation
    # ------------------------------------------------------------------
    def forward(self, X):
        """
        Forward pass through the network.

        Z1 = X.W1 + b1      -> A1 = ReLU(Z1)
        Z2 = A1.W2 + b2     -> A2 = ReLU(Z2)
        Z3 = A2.W3 + b3     -> A3 = Sigmoid(Z3)
        """
        W1, W2, W3 = self.weights["W1"], self.weights["W2"], self.weights["W3"]
        b1, b2, b3 = self.biases["b1"], self.biases["b2"], self.biases["b3"]

        Z1 = np.dot(X, W1) + b1
        A1 = self.relu(Z1)

        Z2 = np.dot(A1, W2) + b2
        A2 = self.relu(Z2)

        Z3 = np.dot(A2, W3) + b3
        A3 = self.sigmoid(Z3)

        self.cache = {"X": X, "Z1": Z1, "A1": A1, "Z2": Z2, "A2": A2, "Z3": Z3, "A3": A3}
        return A3

    # ------------------------------------------------------------------
    # Loss Functions
    # ------------------------------------------------------------------
    @staticmethod
    def binary_cross_entropy(y_true, y_pred):
        """
        Binary Cross-Entropy Loss.
        L = -(1/m) * sum[ y*log(A3) + (1-y)*log(1-A3) ]
        Clipped to avoid log(0).
        """
        m = y_true.shape[0]
        y_pred_clipped = np.clip(y_pred, 1e-15, 1 - 1e-15)
        loss = -np.sum(
            y_true * np.log(y_pred_clipped) + (1 - y_true) * np.log(1 - y_pred_clipped)
        ) / m
        return loss

    @staticmethod
    def mean_squared_error(y_true, y_pred):
        """MSE = (1/m) * sum( (y - A3)^2 ) — secondary comparison utility."""
        m = y_true.shape[0]
        return np.sum((y_true - y_pred) ** 2) / m

    # ------------------------------------------------------------------
    # Backward Propagation
    # ------------------------------------------------------------------
    def backward(self, y_true):
        """
        Computes gradients of the loss with respect to every weight and bias
        using the chain rule (backpropagation), following:

        dZ3 = A3 - y
        dW3 = (1/m) A2^T . dZ3      db3 = (1/m) sum(dZ3)
        dA2 = dZ3 . W3^T
        dZ2 = dA2 * I(Z2 > 0)
        dW2 = (1/m) A1^T . dZ2      db2 = (1/m) sum(dZ2)
        dA1 = dZ2 . W2^T
        dZ1 = dA1 * I(Z1 > 0)
        dW1 = (1/m) X^T . dZ1       db1 = (1/m) sum(dZ1)
        """
        X = self.cache["X"]
        Z1, A1 = self.cache["Z1"], self.cache["A1"]
        Z2, A2 = self.cache["Z2"], self.cache["A2"]
        A3 = self.cache["A3"]

        W2, W3 = self.weights["W2"], self.weights["W3"]

        m = X.shape[0]
        y_true = y_true.reshape(A3.shape)

        # Output layer gradients
        dZ3 = A3 - y_true
        dW3 = np.dot(A2.T, dZ3) / m
        db3 = np.sum(dZ3, axis=0, keepdims=True) / m

        # Hidden layer 2 gradients
        dA2 = np.dot(dZ3, W3.T)
        dZ2 = dA2 * self.relu_derivative(Z2)
        dW2 = np.dot(A1.T, dZ2) / m
        db2 = np.sum(dZ2, axis=0, keepdims=True) / m

        # Hidden layer 1 gradients
        dA1 = np.dot(dZ2, W2.T)
        dZ1 = dA1 * self.relu_derivative(Z1)
        dW1 = np.dot(X.T, dZ1) / m
        db1 = np.sum(dZ1, axis=0, keepdims=True) / m

        grads = {
            "W1": dW1, "b1": db1,
            "W2": dW2, "b2": db2,
            "W3": dW3, "b3": db3,
        }
        return grads

    # ------------------------------------------------------------------
    # Training Loop
    # ------------------------------------------------------------------
    def train(self, X, y, epochs=800, batch_size=32, verbose=True, print_every=50):
        """
        Trains the network using mini-batch gradient descent with the
        configured optimizer (SGD or Adam). Records loss/accuracy history.
        """
        y = y.reshape(-1, 1)
        m = X.shape[0]

        for epoch in range(1, epochs + 1):
            # Shuffle data each epoch
            permutation = np.random.permutation(m)
            X_shuffled = X[permutation]
            y_shuffled = y[permutation]

            epoch_losses = []

            for start in range(0, m, batch_size):
                end = start + batch_size
                X_batch = X_shuffled[start:end]
                y_batch = y_shuffled[start:end]

                # Forward pass
                A3 = self.forward(X_batch)
                batch_loss = self.binary_cross_entropy(y_batch, A3)
                epoch_losses.append(batch_loss)

                # Backward pass
                grads = self.backward(y_batch)

                # Parameter update via optimizer
                params = {**self.weights, **self.biases}
                updated_params = self.optimizer.update(params, grads)
                self.weights["W1"] = updated_params["W1"]
                self.weights["W2"] = updated_params["W2"]
                self.weights["W3"] = updated_params["W3"]
                self.biases["b1"] = updated_params["b1"]
                self.biases["b2"] = updated_params["b2"]
                self.biases["b3"] = updated_params["b3"]

            # Full-dataset metrics for this epoch (for plotting curves)
            full_pred = self.forward(X)
            full_loss = self.binary_cross_entropy(y, full_pred)
            full_acc = self.accuracy(y, full_pred)

            self.history["loss"].append(full_loss)
            self.history["accuracy"].append(full_acc)

            if verbose and (epoch % print_every == 0 or epoch == 1 or epoch == epochs):
                print(f"Epoch {epoch:4d}/{epochs} | Loss: {full_loss:.5f} | Accuracy: {full_acc*100:.2f}%")

        return self.history

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------
    def predict_proba(self, X):
        """Returns raw sigmoid probabilities (shape: [m, 1])."""
        return self.forward(X)

    def predict(self, X, threshold=0.5):
        """Returns binary class predictions (0 or 1)."""
        probs = self.predict_proba(X)
        return (probs >= threshold).astype(int)

    @staticmethod
    def accuracy(y_true, y_pred_proba, threshold=0.5):
        y_true = y_true.reshape(-1, 1)
        y_pred = (y_pred_proba >= threshold).astype(int)
        return float(np.mean(y_pred == y_true))

    # ------------------------------------------------------------------
    # Save / Load weights (.npz format)
    # ------------------------------------------------------------------
    def save_weights(self, filepath):
        """Saves all weights, biases, and architecture metadata to a .npz file."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        np.savez(
            filepath,
            W1=self.weights["W1"], b1=self.biases["b1"],
            W2=self.weights["W2"], b2=self.biases["b2"],
            W3=self.weights["W3"], b3=self.biases["b3"],
            input_size=self.input_size,
            hidden1_size=self.hidden1_size,
            hidden2_size=self.hidden2_size,
            output_size=self.output_size,
        )
        print(f"[NeuralNetwork] Weights saved to {filepath}")

    def load_weights(self, filepath):
        """Loads weights, biases, and architecture metadata from a .npz file."""
        data = np.load(filepath)
        self.weights["W1"] = data["W1"]
        self.weights["W2"] = data["W2"]
        self.weights["W3"] = data["W3"]
        self.biases["b1"] = data["b1"]
        self.biases["b2"] = data["b2"]
        self.biases["b3"] = data["b3"]
        self.input_size = int(data["input_size"])
        self.hidden1_size = int(data["hidden1_size"])
        self.hidden2_size = int(data["hidden2_size"])
        self.output_size = int(data["output_size"])
        print(f"[NeuralNetwork] Weights loaded from {filepath}")
