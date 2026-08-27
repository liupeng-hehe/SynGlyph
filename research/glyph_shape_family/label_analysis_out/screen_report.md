# Label → feature screening

- Samples: 26
- Features: 34
- Classes: 8 — ['0', '1', '2', '3', '4', '5', '6', '7']
- Label column: `color_cluster`

## Top 15 by composite rank (mean of normalized ranks across methods)

```
         feature  rf_gini_importance  perm_importance_mean  mutual_information  f_statistic  f_pvalue  kw_statistic  kw_pvalue  rank_rf  rank_perm  rank_mi   rank_f  rank_kw  composite_score
         vprof_9            0.062427              0.000000            0.349382     5.526195  0.001611     15.613458   0.028892 0.941176        0.5 0.794118 1.000000 0.970588         0.841176
 normalize_scale            0.058423              0.037179            0.310215     1.492546  0.232010     10.170416   0.179120 0.882353        1.0 0.764706 0.705882 0.735294         0.817647
        vprof_11            0.060235              0.000000            0.202442     3.671222  0.012250     15.489952   0.030207 0.911765        0.5 0.735294 0.911765 0.941176         0.800000
loop_side_signed            0.051129              0.000000            0.442716     2.604017  0.048179     13.969167   0.051732 0.823529        0.5 0.882353 0.852941 0.911765         0.794118
         vprof_0            0.065885              0.000000            0.451579     1.199440  0.352148     13.589919   0.058975 1.000000        0.5 0.911765 0.588235 0.882353         0.776471
   loop_side_abs            0.055392              0.000000            0.368140     2.107262  0.096010     11.708647   0.110557 0.852941        0.5 0.823529 0.823529 0.764706         0.752941
   has_descender            0.012974              0.000000            1.633593     4.549451  0.004455     15.972222   0.025371 0.264706        0.5 1.000000 0.970588 1.000000         0.747059
        vprof_10            0.046442              0.000000            0.426402     1.460987  0.242783     11.918531   0.103270 0.794118        0.5 0.852941 0.676471 0.794118         0.723529
         vprof_7            0.046383              0.000000            0.171483     1.903760  0.128315     13.520434   0.060399 0.764706        0.5 0.676471 0.764706 0.852941         0.711765
        vprof_13            0.041425              0.000000            0.110752     3.467904  0.015708     13.004037   0.072010 0.705882        0.5 0.588235 0.882353 0.823529         0.700000
         vprof_5            0.063318              0.000000            0.110205     4.057013  0.007760      8.081488   0.325463 0.970588        0.5 0.558824 0.941176 0.500000         0.694118
        vprof_14            0.026428              0.000000            0.124361     1.301466  0.304966     10.059977   0.185200 0.500000        0.5 0.617647 0.647059 0.705882         0.594118
       num_loops            0.043774              0.000000            0.009154     1.927609  0.124006      8.101755   0.323707 0.735294        0.5 0.382353 0.794118 0.529412         0.588235
         vprof_2            0.038441              0.000000            0.082963     0.774192  0.616507     10.050892   0.185708 0.676471        0.5 0.500000 0.441176 0.676471         0.558824
   num_endpoints            0.018966              0.000000            1.402571     0.705698  0.667671      9.251942   0.235070 0.294118        0.5 0.970588 0.382353 0.647059         0.558824
```

## Interpretation

- **rf_gini_importance**: RandomForest split impurity (supervised fit).
- **perm_importance_mean**: drop in accuracy when feature shuffled.
- **mutual_information**: dependency between feature and label.
- **f_statistic / f_pvalue**: ANOVA F between label groups.
- **kruskal_wallis**: non-parametric rank test across groups.

High composite_score = consistently important across methods. 
Confounding: if labels correlate with letter identity, shape features may proxy letter.
