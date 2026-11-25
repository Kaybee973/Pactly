import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { FunnelSimpleIcon, PulseIcon, ScrollIcon, ShieldCheckIcon } from "@phosphor-icons/react";

import { useCategories, useDiscoverProviders, useProviderSuggestions } from "../../api/hooks";
import type { DiscoverAvailability, DiscoverSuggestion } from "../../api/types";
import { CategoryTabs } from "../../components/CategoryTabs";
import { EmptyResults } from "../../components/EmptyResults";
import { FilterRail } from "../../components/FilterRail";
import { FilterSheet } from "../../components/FilterSheet";
import { ProviderCard } from "../../components/ProviderCard";
import { ProviderCardSkeleton } from "../../components/ProviderCardSkeleton";
import { SearchBox } from "../../components/SearchBox";
import {
  DEFAULT_DISCOVER_SORT,
  applyDiscoverView,
  readDiscoverFilters,
  type DiscoverSort,
} from "../../lib/discoverFilters";

/** AC5: six skeleton cards match the real card layout on first load. */
const SKELETON_COUNT = 6;

/**
 * `/discover` -- the Discover page, in the "Editorial Warmth" format
 * adopted app-wide 2026-09-20 (see `styles/tokens.css`'s own header):
 * a magazine masthead, a featured hero card for the first result, and
 * Phosphor icons throughout. The filter/URL-state logic below is
 * unchanged from the original marketplace-grid version -- only the
 * presentation changed.
 *
 * Every filter and the query live in the URL alongside `category` (`q`,
 * `format` [repeated], `minPrice`, `maxPrice`, `maxDepositBps`, `when`) so
 * the back button restores them and results update without a reload. An
 * unknown or invalid value is simply absent from what this page reads back
 * out of `searchParams` -- the backend applies the same "ignore, never
 * error" rule to whatever actually reaches it.
 */
export function DiscoverPage() {
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data?.categories ?? [];
  const categoriesReady = categoriesQuery.isSuccess;

  const requestedSlug = searchParams.get("category") ?? undefined;
  const knownCategorySlugs = useMemo(() => categories.map((category) => category.slug), [categories]);
  // Issue #156: category, neighbourhood, the sort and the searched words are
  // all read back from the URL by one parser, so a shared link, the back
  // button and the first load restore exactly the same view. A slug is only
  // ever resolved once the real category list is in -- before that the
  // known list is empty and every slug would wrongly look "unknown".
  const filters = useMemo(
    () => readDiscoverFilters(searchParams, categoriesReady ? knownCategorySlugs : []),
    [searchParams, categoriesReady, knownCategorySlugs],
  );
  const selectedSlug = filters.category;
  const q = filters.q;
  const formats = filters.formats;
  const minPrice = filters.minPrice;
  const maxPrice = filters.maxPrice;
  const maxDepositBps = filters.maxDepositBps;
  const availability = filters.when;
  const neighborhood = filters.neighborhood;
  const sort = filters.sort;

  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next);
  }

  function selectCategory(slug: string | undefined): void {
    updateParams((params) => {
      if (slug === undefined) {
        params.delete("category");
      } else {
        params.set("category", slug);
      }
    });
  }

  function setQuery(next: string): void {
    updateParams((params) => {
      if (next.trim()) {
        params.set("q", next);
      } else {
        params.delete("q");
      }
    });
  }

  function toggleFormat(format: string): void {
    updateParams((params) => {
      const current = params.getAll("format");
      params.delete("format");
      const next = current.includes(format) ? current.filter((value) => value !== format) : [...current, format];
      for (const value of next) {
        params.append("format", value);
      }
    });
  }

  function setPriceRange(min: string | undefined, max: string | undefined): void {
    updateParams((params) => {
      if (min !== undefined) {
        params.set("minPrice", min);
      } else {
        params.delete("minPrice");
      }
      if (max !== undefined) {
        params.set("maxPrice", max);
      } else {
        params.delete("maxPrice");
      }
    });
  }

  function setMaxDepositBps(bps: number | undefined): void {
    updateParams((params) => {
      if (bps !== undefined) {
        params.set("maxDepositBps", String(bps));
      } else {
        params.delete("maxDepositBps");
      }
    });
  }

  function setAvailability(value: DiscoverAvailability | undefined): void {
    updateParams((params) => {
      if (value) {
        params.set("when", value);
      } else {
        params.delete("when");
      }
    });
  }

  function setNeighborhood(next: string): void {
    updateParams((params) => {
      const trimmed = next.trim();
      if (trimmed) {
        params.set("neighborhood", trimmed);
      } else {
        params.delete("neighborhood");
      }
    });
  }

  function setSort(next: DiscoverSort): void {
    updateParams((params) => {
      if (next === DEFAULT_DISCOVER_SORT) {
        params.delete("sort");
      } else {
        params.set("sort", next);
      }
    });
  }

  /** Issue #156: one control clears the whole filtered view, category and
   * searched words included, back to the unfiltered list. */
  function clearAllFilters(): void {
    setSearchParams(new URLSearchParams());
  }

  function clearFilter(key: string): void {
    updateParams((params) => {
      if (key === "format") params.delete("format");
      if (key === "neighborhood") params.delete("neighborhood");
      if (key === "price") {
        params.delete("minPrice");
        params.delete("maxPrice");
      }
      if (key === "deposit") params.delete("maxDepositBps");
    });
  }

  function handleSelectSuggestion(suggestion: DiscoverSuggestion): void {
    if (suggestion.kind === "category") {
      updateParams((params) => {
        params.set("category", suggestion.value);
        params.delete("q");
      });
    } else {
      setQuery(suggestion.value);
    }
  }

  // Waiting on categories to resolve a requested slug: hold the providers
  // query back entirely rather than issuing it against a not-yet-decided
  // filter.
  const waitingForCategoryResolution = Boolean(requestedSlug) && !categoriesReady && !categoriesQuery.isError;
  const providersQuery = useDiscoverProviders(
    {
      category: selectedSlug,
      q: q || undefined,
      formats: formats.length > 0 ? formats : undefined,
      minPrice,
      maxPrice,
      maxDepositBps,
      when: availability,
    },
    { enabled: !waitingForCategoryResolution },
  );
  const suggestionsQuery = useProviderSuggestions(q);

  const selectedCategoryName = categories.find((category) => category.slug === selectedSlug)?.name;
  const providers = providersQuery.data?.providers ?? [];
  // Issue #156: the neighbourhood and the sort order act on the cards the
  // backend already returned (soonest first), so the URL stays the only
  // source of truth for both.
  const visibleProviders = useMemo(
    () => applyDiscoverView(providers, neighborhood, sort),
    [providers, neighborhood, sort],
  );
  const [featured, ...rest] = visibleProviders;
  const showProvidersSkeleton = waitingForCategoryResolution || providersQuery.isLoading;

  const activeFilterCount = [formats.length > 0, neighborhood.length > 0, minPrice !== undefined || maxPrice !== undefined, maxDepositBps !== undefined, availability !== undefined].filter(Boolean).length;

  const filterChips = [
    formats.length > 0 ? { key: "format", label: "session format" } : undefined,
    neighborhood.length > 0 ? { key: "neighborhood", label: "neighbourhood" } : undefined,
    minPrice !== undefined || maxPrice !== undefined ? { key: "price", label: "price range" } : undefined,
    maxDepositBps !== undefined ? { key: "deposit", label: "deposit cap" } : undefined,
  ].filter((chip): chip is { key: string; label: string } => chip !== undefined);

  const hasAnythingToLoosen = Boolean(q) || filterChips.length > 0 || availability !== undefined;
  const browseLabel = selectedCategoryName && hasAnythingToLoosen ? `Browse all of ${selectedCategoryName}` : "Browse all providers";

  function handleBrowseWider(): void {
    if (selectedCategoryName && hasAnythingToLoosen) {
      updateParams((params) => {
        params.delete("q");
        params.delete("format");
        params.delete("minPrice");
        params.delete("maxPrice");
        params.delete("maxDepositBps");
        params.delete("when");
      });
    } else {
      setSearchParams(new URLSearchParams());
    }
  }

  const filterFieldsProps = {
    formats,
    onToggleFormat: toggleFormat,
    minPrice,
    maxPrice,
    onPriceRangeChange: setPriceRange,
    maxDepositBps,
    onMaxDepositBpsChange: setMaxDepositBps,
    availability,
    onAvailabilityChange: setAvailability,
    neighborhood,
    onNeighborhoodChange: setNeighborhood,
    sort,
    onSortChange: setSort,
  };

  const resultsQualifier = q.trim() ? q.trim() : selectedCategoryName;
  const resultsHeading = showProvidersSkeleton
    ? "Places"
    : `${visibleProviders.length} ${visibleProviders.length === 1 ? "place" : "places"}${resultsQualifier ? ` · ${resultsQualifier}` : ""}`;

  return (
    <div className="editorial-page">
      <motion.header
        className="editorial-masthead"
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <span className="editorial-masthead__eyebrow">
          <ScrollIcon size={14} weight="bold" aria-hidden="true" />
          Pactly Journal — local appointments
        </span>
        <h1>Discover, held in trust</h1>
        <p className="editorial-masthead__sub">
          A hand-picked look at shops, salons and clinics — every seat backed by a deposit that waits in escrow, not
          your provider&rsquo;s pocket.
        </p>
      </motion.header>

      <div className="editorial-trust">
        <div className="editorial-trust__item">
          <ShieldCheckIcon size={20} weight="fill" aria-hidden="true" />
          <p>
            <b>No blind prepay.</b> Deposit waits in escrow until the appointment happens.
          </p>
        </div>
        <div className="editorial-trust__item">
          <FunnelSimpleIcon size={20} weight="fill" aria-hidden="true" />
          <p>
            <b>Clear booking policy</b> for cancellations and no-shows, shown before you lock a slot.
          </p>
        </div>
        <div className="editorial-trust__item editorial-trust__item--live">
          <PulseIcon size={20} weight="fill" aria-hidden="true" />
          <p>
            <b>Trustless Work escrow</b> · operational
          </p>
        </div>
      </div>

      <div className="editorial-controls">
        <SearchBox
          value={q}
          onCommit={setQuery}
          suggestions={suggestionsQuery.data?.suggestions ?? []}
          suggestionsLoading={suggestionsQuery.isLoading}
          onSelectSuggestion={handleSelectSuggestion}
        />
        <button type="button" className="editorial-filters-trigger" onClick={() => setFilterSheetOpen(true)}>
          <FunnelSimpleIcon size={16} weight="bold" aria-hidden="true" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {activeFilterCount > 0 || q || selectedSlug || sort !== DEFAULT_DISCOVER_SORT ? (
          <button type="button" className="button-ghost" onClick={clearAllFilters}>
            Clear all
          </button>
        ) : null}
      </div>

      {categoriesQuery.isError ? (
        <div className="banner banner--alert">
          <p>Connection dropped. Your deposit is untouched.</p>
          <button type="button" className="button-ghost" onClick={() => categoriesQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <CategoryTabs categories={categories} selectedSlug={selectedSlug} onSelect={selectCategory} />

          <div className="editorial-layout">
            <div className="editorial-rail">
              <FilterRail {...filterFieldsProps} />
            </div>

            <div>
              {showProvidersSkeleton ? (
                <>
                  <div className="editorial-results-head">
                    <div>
                      <h2>{resultsHeading}</h2>
                      <p>Physical appointments — shops, salons and clinics with a real chair or room</p>
                    </div>
                  </div>
                  <div className="editorial-grid">
                    {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                      <ProviderCardSkeleton key={index} />
                    ))}
                  </div>
                </>
              ) : providersQuery.isError ? (
                <div className="banner banner--alert">
                  <p>Connection dropped. Your deposit is untouched.</p>
                  <button type="button" className="button-ghost" onClick={() => providersQuery.refetch()}>
                    Try again
                  </button>
                </div>
              ) : visibleProviders.length === 0 ? (
                <EmptyResults
                  query={q}
                  filterChips={filterChips}
                  onClearFilter={clearFilter}
                  hasAvailabilityFilter={availability !== undefined}
                  onClearAvailability={() => setAvailability(undefined)}
                  browseLabel={browseLabel}
                  onBrowseWider={handleBrowseWider}
                  suggestions={providersQuery.data?.suggestions}
                  onBrowseCategory={(slug) =>
                    updateParams((params) => {
                      params.set("category", slug);
                      params.delete("q");
                    })
                  }
                />
              ) : (
                <>
                  <div className="editorial-results-head">
                    <div>
                      <h2>{resultsHeading}</h2>
                      <p>Physical appointments — shops, salons and clinics with a real chair or room</p>
                    </div>
                  </div>

                  {featured ? <ProviderCard provider={featured} variant="featured" /> : null}

                  {rest.length > 0 ? (
                    <div className="editorial-grid">
                      {rest.map((provider, index) => (
                        <ProviderCard key={provider.id} provider={provider} index={index} />
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </>
      )}

      <FilterSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} {...filterFieldsProps} />
    </div>
  );
}
