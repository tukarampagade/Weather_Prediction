"""
train_model.py
---------------
Trains the from-scratch Neural Network on the preprocessed weather
dataset, evaluates it, saves the trained weights, and generates all
7 required visualization graphs into static/graphs/.

Run with: python train_model.py
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")  # non-interactive backend, safe for headless training
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

from preprocess import preprocess_pipeline, DATA_PATH
from neural_network import NeuralNetwork
from optimizer import SGD, Adam

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
GRAPHS_DIR = os.path.join(BASE_DIR, "static", "graphs")
WEIGHTS_PATH = os.path.join(MODELS_DIR, "model_weights.npz")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(GRAPHS_DIR, exist_ok=True)

sns.set_style("whitegrid")
PALETTE = {"navy": "#0B2545", "teal": "#13847E", "grey": "#8D99AE", "white": "#FFFFFF", "accent": "#F4A261"}

EPOCHS = 200
BATCH_SIZE = 32
LEARNING_RATE = 0.006


# ------------------------------------------------------------------
# 1. Evaluation metrics
# ------------------------------------------------------------------
def compute_confusion_matrix(y_true, y_pred):
    y_true = y_true.reshape(-1)
    y_pred = y_pred.reshape(-1)
    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))
    return tp, tn, fp, fn


def compute_metrics(tp, tn, fp, fn):
    accuracy = (tp + tn) / max(tp + tn + fp + fn, 1)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-15)
    return accuracy, precision, recall, f1


# ------------------------------------------------------------------
# 2. Graph generation functions
# ------------------------------------------------------------------
def plot_training_loss(history):
    plt.figure(figsize=(8, 5))
    plt.plot(history["loss"], color=PALETTE["navy"], linewidth=2)
    plt.title("Training Loss over Epochs (Binary Cross-Entropy)", fontsize=13, fontweight="bold")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "training_loss.png"), dpi=120)
    plt.close()


def plot_accuracy(history):
    plt.figure(figsize=(8, 5))
    plt.plot(np.array(history["accuracy"]) * 100, color=PALETTE["teal"], linewidth=2)
    plt.title("Training Accuracy over Epochs", fontsize=13, fontweight="bold")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy (%)")
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "accuracy.png"), dpi=120)
    plt.close()


def plot_confusion_matrix(tp, tn, fp, fn):
    matrix = np.array([[tn, fp], [fn, tp]])
    plt.figure(figsize=(6, 5))
    sns.heatmap(
        matrix, annot=True, fmt="d", cmap="Blues", cbar=False,
        xticklabels=["Predicted: No Rain", "Predicted: Rain"],
        yticklabels=["Actual: No Rain", "Actual: Rain"],
        annot_kws={"size": 14, "weight": "bold"},
    )
    plt.title("Confusion Matrix", fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "confusion_matrix.png"), dpi=120)
    plt.close()


def plot_correlation_heatmap(df):
    numeric_df = df.select_dtypes(include=[np.number])
    plt.figure(figsize=(10, 8))
    corr = numeric_df.corr()
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", linewidths=0.5, annot_kws={"size": 7})
    plt.title("Feature Correlation Heatmap", fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "heatmap.png"), dpi=120)
    plt.close()


def plot_activation_functions():
    z = np.linspace(-10, 10, 400)
    relu = np.maximum(0, z)
    sigmoid = 1 / (1 + np.exp(-z))
    tanh = np.tanh(z)

    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5))

    axes[0].plot(z, relu, color=PALETTE["navy"], linewidth=2.5)
    axes[0].set_title("ReLU: f(z) = max(0, z)", fontweight="bold")
    axes[0].axhline(0, color="grey", linewidth=0.8)
    axes[0].axvline(0, color="grey", linewidth=0.8)
    axes[0].grid(alpha=0.3)

    axes[1].plot(z, sigmoid, color=PALETTE["teal"], linewidth=2.5)
    axes[1].set_title("Sigmoid: f(z) = 1 / (1 + e^-z)", fontweight="bold")
    axes[1].axhline(0, color="grey", linewidth=0.8)
    axes[1].axvline(0, color="grey", linewidth=0.8)
    axes[1].grid(alpha=0.3)

    axes[2].plot(z, tanh, color=PALETTE["accent"], linewidth=2.5)
    axes[2].set_title("Tanh: f(z) = tanh(z)", fontweight="bold")
    axes[2].axhline(0, color="grey", linewidth=0.8)
    axes[2].axvline(0, color="grey", linewidth=0.8)
    axes[2].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "activation_functions.png"), dpi=120)
    plt.close()


def plot_rain_distribution(df):
    plt.figure(figsize=(7, 5))
    counts = df["RainTomorrow"].value_counts().sort_index()
    labels = ["No Rain", "Rain"]
    colors = [PALETTE["grey"], PALETTE["teal"]]
    plt.bar(labels, counts.values, color=colors, edgecolor="black")
    for i, v in enumerate(counts.values):
        plt.text(i, v + 10, str(v), ha="center", fontweight="bold")
    plt.title("Distribution of RainTomorrow Classes", fontsize=13, fontweight="bold")
    plt.ylabel("Number of Samples")
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "rain_distribution.png"), dpi=120)
    plt.close()


def plot_optimizer_comparison(sgd_history, adam_history):
    plt.figure(figsize=(8, 5))
    plt.plot(sgd_history["loss"], label="SGD", color=PALETTE["grey"], linewidth=2)
    plt.plot(adam_history["loss"], label="Adam", color=PALETTE["teal"], linewidth=2)
    plt.title("Optimizer Comparison: SGD vs Adam (Loss Curves)", fontsize=13, fontweight="bold")
    plt.xlabel("Epoch")
    plt.ylabel("Binary Cross-Entropy Loss")
    plt.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, "optimizer_comparison.png"), dpi=120)
    plt.close()


# ------------------------------------------------------------------
# 3. Main training routine
# ------------------------------------------------------------------
def main():
    print("\n" + "#" * 70)
    print("# WEATHER PREDICTION - NEURAL NETWORK TRAINING (from scratch, NumPy)")
    print("#" * 70 + "\n")

    # ---- Preprocess data ----
    X_train, X_test, y_train, y_test, scaler, feature_names = preprocess_pipeline(verbose=True)
    input_size = X_train.shape[1]

    # ---- Train primary model (Adam) ----
    print("\n" + "=" * 70)
    print(f"TRAINING PRIMARY MODEL (Optimizer = Adam, Epochs = {EPOCHS})")
    print("=" * 70)
    model = NeuralNetwork(
        input_size=input_size, hidden1_size=16, hidden2_size=8, output_size=1,
        optimizer="adam", learning_rate=LEARNING_RATE, seed=42
    )
    history_adam = model.train(X_train, y_train, epochs=EPOCHS, batch_size=BATCH_SIZE,
                                verbose=True, print_every=50)

    # ---- Evaluate on test set ----
    y_pred_proba = model.predict_proba(X_test)
    y_pred = model.predict(X_test)
    tp, tn, fp, fn = compute_confusion_matrix(y_test, y_pred)
    accuracy, precision, recall, f1 = compute_metrics(tp, tn, fp, fn)
    test_mse = model.mean_squared_error(y_test.reshape(-1, 1), y_pred_proba)

    print("\n" + "=" * 70)
    print("TEST SET EVALUATION")
    print("=" * 70)
    print(f"Accuracy  : {accuracy*100:.2f}%")
    print(f"Precision : {precision*100:.2f}%")
    print(f"Recall    : {recall*100:.2f}%")
    print(f"F1 Score  : {f1*100:.2f}%")
    print(f"MSE       : {test_mse:.5f}")
    print(f"Confusion Matrix -> TP: {tp}  TN: {tn}  FP: {fp}  FN: {fn}")

    # ---- Save trained weights ----
    model.save_weights(WEIGHTS_PATH)

    # Save evaluation metrics for the Flask dashboard to read
    metrics_path = os.path.join(MODELS_DIR, "metrics.npz")
    np.savez(
        metrics_path,
        accuracy=accuracy, precision=precision, recall=recall, f1=f1,
        tp=tp, tn=tn, fp=fp, fn=fn,
        train_samples=X_train.shape[0], test_samples=X_test.shape[0],
        epochs=EPOCHS, optimizer=model.optimizer_name,
    )
    print(f"Metrics saved to {metrics_path}")

    # ---- Train a secondary SGD model (same init) purely for the optimizer comparison graph ----
    print("\n" + "=" * 70)
    print(f"TRAINING COMPARISON MODEL (Optimizer = SGD, Epochs = {EPOCHS})")
    print("=" * 70)
    model_sgd = NeuralNetwork(
        input_size=input_size, hidden1_size=16, hidden2_size=8, output_size=1,
        optimizer="sgd", learning_rate=LEARNING_RATE, seed=42
    )
    history_sgd = model_sgd.train(X_train, y_train, epochs=EPOCHS, batch_size=BATCH_SIZE,
                                   verbose=True, print_every=100)

    # ---- Generate all graphs ----
    print("\n" + "=" * 70)
    print("GENERATING VISUALIZATIONS")
    print("=" * 70)

    raw_df = pd.read_csv(DATA_PATH)
    encoded_df = raw_df.copy()
    encoded_df["RainToday"] = encoded_df["RainToday"].map({"Yes": 1, "No": 0})
    encoded_df["RainTomorrow"] = encoded_df["RainTomorrow"].map({"Yes": 1, "No": 0})

    plot_training_loss(history_adam)
    print("  [1/7] training_loss.png saved")

    plot_accuracy(history_adam)
    print("  [2/7] accuracy.png saved")

    plot_confusion_matrix(tp, tn, fp, fn)
    print("  [3/7] confusion_matrix.png saved")

    plot_correlation_heatmap(encoded_df)
    print("  [4/7] heatmap.png saved")

    plot_activation_functions()
    print("  [5/7] activation_functions.png saved")

    plot_rain_distribution(encoded_df)
    print("  [6/7] rain_distribution.png saved")

    plot_optimizer_comparison(history_sgd, history_adam)
    print("  [7/7] optimizer_comparison.png saved")

    print("\nAll graphs saved to:", GRAPHS_DIR)
    print("\nTraining complete. Model ready for inference via app.py\n")


if __name__ == "__main__":
    main()
