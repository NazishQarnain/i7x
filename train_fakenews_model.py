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
X_tr, X_te, y_tr, y_te = train_test_split(
    df["text"].astype(str), df["label"].astype(int),
    test_size=0.2, random_state=42, stratify=df["label"])

# Must match tokenize() in credibility.js: lowercase, tokens of 2+ word chars.
vec = TfidfVectorizer(lowercase=True, token_pattern=r"(?u)\b\w\w+\b",
                      sublinear_tf=True, max_features=5000, min_df=2)
clf = LogisticRegression(max_iter=1000, class_weight="balanced", C=2.0)
clf.fit(vec.fit_transform(X_tr), y_tr)
print(classification_report(y_te, clf.predict(vec.transform(X_te))))

terms = {t: [round(float(vec.idf_[i]), 5), round(float(clf.coef_[0][i]), 5)]
         for t, i in vec.vocabulary_.items()}
json.dump({"intercept": round(float(clf.intercept_[0]), 5), "terms": terms},
          open(out, "w"), separators=(",", ":"))
print(f"Saved {out} ({len(terms)} terms)")
