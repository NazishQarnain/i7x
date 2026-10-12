"""Train the fake-news text model and export it as JSON for the browser.

Usage:  python train_fakenews_model.py data.csv [out.json]
CSV needs two columns: text,label   (label: 1 = fake/misleading, 0 = real)
Install: pip install scikit-learn pandas
Copy the output to the site root as fakenews_model.json (credibility.js
loads it automatically; without it only heuristics + community signals run).
"""
import json, sys
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else "fakenews_model.json"
df = pd.read_csv(src).dropna(subset=["text", "label"])
df["label"] = df["label"].astype(int)
counts = df["label"].value_counts().to_dict()
print("Rows per label (1 = fake, 0 = real):", counts)

# Clear errors instead of cryptic scikit-learn crashes on tiny data.
if len(counts) < 2:
    sys.exit("ERROR: the CSV has only one label. You need BOTH fake (1) and "
             "real (0) examples. In the admin page, keep 'Include imported "
             "news as real' ticked and mark some posts Real too.")
if min(counts.values()) < 5 or len(df) < 30:
    print("WARNING: very little data (fewer than 5 examples of a label or "
          "30 rows). The model will be unreliable; collect more labels.")

can_split = min(counts.values()) >= 5
if can_split:
    X_tr, X_te, y_tr, y_te = train_test_split(
        df["text"].astype(str), df["label"],
        test_size=0.2, random_state=42, stratify=df["label"])
else:  # too small to hold anything out: train on everything
    X_tr, y_tr = df["text"].astype(str), df["label"]
    X_te, y_te = X_tr, y_tr
    print("Too few examples to hold out a test set; the report below is on "
          "the training data and is NOT a real accuracy measure.")

# Must match tokenize() in credibility.js: lowercase, tokens of 2+ word chars.
vec = TfidfVectorizer(lowercase=True, token_pattern=r"(?u)\b\w\w+\b",
                      sublinear_tf=True, max_features=5000,
                      min_df=2 if len(df) >= 100 else 1)
clf = LogisticRegression(max_iter=1000, class_weight="balanced", C=2.0)
clf.fit(vec.fit_transform(X_tr), y_tr)
print(classification_report(y_te, clf.predict(vec.transform(X_te))))

terms = {t: [round(float(vec.idf_[i]), 5), round(float(clf.coef_[0][i]), 5)]
         for t, i in vec.vocabulary_.items()}
json.dump({"intercept": round(float(clf.intercept_[0]), 5), "terms": terms},
          open(out, "w"), separators=(",", ":"))
print(f"Saved {out} ({len(terms)} terms)")
